"""
Python AST Parser - Converts Python source code into a flow graph structure.

Handles incomplete/broken code by falling back to partial parsing.
The output is a JSON-serializable graph with nodes and edges ready for React Flow.
"""

import ast
import io
import re
import os
import tokenize as tok_mod
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any


class FlowGraphBuilder:
    """Traverses Python AST and builds a flow graph with nodes and edges."""

    def __init__(self):
        self.nodes: List[dict] = []
        self.edges: List[dict] = []
        self._counter: int = 0
        self._all_function_defs: Dict[str, dict] = {}  # qualified_name -> AST info
        self._file_function_map: Dict[str, List[str]] = {}  # filepath -> [func_names]
        self._all_class_defs: Dict[str, dict] = {}  # class qualified_name -> AST info
        # Block grouping support
        self._block_stack: List[str] = []  # stack of active block IDs
        self._block_info: Dict[str, dict] = {}  # block_id -> {type, label, color}
        self._block_labels: Dict[str, str] = {}  # block_id -> type (always populated)
        self._next_block_id: int = 0
        self.enable_struct_groups: bool = False
        self.enable_chunk_groups: bool = False
        # Comment tracking
        self._comments: List[dict] = []  # merged comments [{start, end, text, is_docstring}]
        self._comment_cursor: int = 0   # index into _comments during visiting
        self._source: str = ""
        self._docstring_lines: set = set()  # line numbers covered by docstrings
        self._collected_breaks: List[str] = []
        self._collected_continues: List[str] = []

    # ── node/edge helpers ───────────────────────────────────────────────

    def _next_id(self) -> str:
        self._counter += 1
        return f"n{self._counter}"

    # ── block grouping ──────────────────────────────────────────────────

    GROUP_COLORS = {
        "while":      "rgba(77,208,225,0.08)",   # cyan
        "for":        "rgba(77,208,225,0.08)",   # cyan
        "if":         "rgba(255,183,77,0.08)",   # orange
        "else":       "rgba(120,144,156,0.08)",  # gray
        "try":        "rgba(239,83,80,0.08)",    # red
        "except":     "rgba(255,112,67,0.08)",   # deep orange
        "finally":    "rgba(120,144,156,0.08)",  # gray
        "with":       "rgba(156,39,176,0.08)",   # purple
        "match_case": "rgba(255,183,77,0.08)",   # orange
        "init":       "rgba(100,181,246,0.08)",  # blue
        "import":     "rgba(129,199,132,0.08)",  # green
    }

    GROUP_BORDERS = {
        "while":      "#4dd0e1",
        "for":        "#4dd0e1",
        "if":         "#ffb74d",
        "else":       "#78909c",
        "try":        "#ef5350",
        "except":     "#ff7043",
        "finally":    "#78909c",
        "with":       "#9c27b0",
        "match_case": "#ffb74d",
        "init":       "#64b5f6",
        "import":     "#81c784",
    }

    def _start_block(self, block_type: str, label: str) -> str:
        """Push a block onto the stack. All add_node() calls inside will be tagged.
        Always tags nodes with blockId; visual group registration is gated by flags."""
        prefix = self._block_stack[-1] + "_" if self._block_stack else "block_"
        block_id = f"{prefix}{self._next_block_id}"
        self._next_block_id += 1
        self._block_labels[block_id] = block_type  # always for frontend isolation
        if self.enable_struct_groups or self.enable_chunk_groups:
            self._block_info[block_id] = {
                "type": block_type,
                "label": label,
                "color": self.GROUP_COLORS.get(block_type, "rgba(100,100,100,0.08)"),
                "border": self.GROUP_BORDERS.get(block_type, "#666"),
            }
        self._block_stack.append(block_id)
        return block_id

    def _end_block(self) -> Optional[str]:
        """Pop the current block. Returns the block_id."""
        if not self._block_stack:
            return None
        return self._block_stack.pop()

    def _collect_blocks(self) -> List[dict]:
        """Collect all groups: {id, type, label, nodeIds, color, border}."""
        # Build reverse map: blockId -> [nodeIds]
        block_nodes: Dict[str, List[str]] = {}
        for node in self.nodes:
            bid = node["data"].get("blockId")
            if bid:
                block_nodes.setdefault(bid, []).append(node["id"])

        blocks = []
        for bid, info in self._block_info.items():
            node_ids = block_nodes.get(bid, [])
            if len(node_ids) >= 2:  # Only create group if at least 2 nodes
                blocks.append({
                    "id": bid,
                    "type": info["type"],
                    "label": info["label"],
                    "nodeIds": node_ids,
                    "color": info["color"],
                    "border": info["border"],
                })
        return blocks

    # ── comment extraction ────────────────────────────────────────────────

    def _extract_comments(self, source: str) -> None:
        """Parse source with tokenize, merge consecutive # comments, detect docstrings."""
        self._comments = []
        self._source = source
        self._comment_cursor = 0
        self._docstring_lines = set()
        try:
            tokens = list(tok_mod.generate_tokens(io.StringIO(source).readline))
        except Exception:
            return

        # Pass 1: find docstrings (first string expression in function/class body)
        try:
            tree = ast.parse(source)
        except SyntaxError:
            tree = None

        docstring_lines: set = set()
        if tree:
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    if (node.body and isinstance(node.body[0], ast.Expr)
                            and isinstance(node.body[0].value, ast.Constant)
                            and isinstance(node.body[0].value.value, str)):
                        ds = node.body[0]
                        start = ds.lineno
                        end = getattr(ds, 'end_lineno', start)
                        text = ds.value.value.strip()
                        self._comments.append({
                            'start': start, 'end': end,
                            'text': text, 'is_docstring': True,
                            'merged': True,
                        })
                        for l in range(start, end + 1):
                            docstring_lines.add(l)
                            self._docstring_lines.add(l)

        # Pass 2: find # comments, merge consecutive ones
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            if tok.type == tok_mod.COMMENT and tok.start[0] not in docstring_lines:
                line = tok.start[0]
                lines = [tok.string[1:].strip()]  # strip leading #
                j = i + 1
                last_line = line
                while j < len(tokens):
                    nt = tokens[j]
                    if nt.type == tok_mod.COMMENT and nt.start[0] == last_line + 1:
                        lines.append(nt.string[1:].strip())
                        last_line = nt.start[0]
                        j += 1
                    elif nt.type in (tok_mod.NEWLINE, tok_mod.NL, tok_mod.ENDMARKER):
                        j += 1
                    else:
                        break
                self._comments.append({
                    'start': line, 'end': last_line,
                    'text': '\n'.join(lines),
                    'is_docstring': False, 'merged': len(lines) > 1,
                })
                i = j
            else:
                i += 1

        # Sort by start line
        self._comments.sort(key=lambda c: c['start'])

    def _emit_comments_before(self, stop_line: int) -> Tuple[Optional[str], List[str]]:
        """Emit comment nodes for all pending comments before stop_line.
        Returns (first_node_id, list_of_exit_ids) like _visit_stmt."""
        first_id = None
        last_exits: List[str] = []
        prev_id = None
        while (self._comment_cursor < len(self._comments)
               and self._comments[self._comment_cursor]['start'] < stop_line):
            c = self._comments[self._comment_cursor]
            prefix = "📄 " if c['is_docstring'] else "💬 "
            text = c['text']
            label = prefix + (text[:80] + "..." if len(text) > 80 else text)
            nid = self.add_node("comment", label, line_no=c['start'],
                                extra={
                                    'commentText': text,
                                    'isDocstring': c['is_docstring'],
                                    'commentStart': c['start'],
                                    'commentEnd': c['end'],
                                    'collapsed': True,
                                })
            if prev_id:
                self.add_edge(prev_id, nid)
            else:
                first_id = nid
            prev_id = nid
            last_exits = [nid]
            self._comment_cursor += 1
        return first_id, last_exits

    def add_node(self,
                 ntype: str,
                 label: str,
                 func_name: str = "",
                 line_no: int = 0,
                 extra: Optional[dict] = None) -> str:
        nid = self._next_id()
        merged_extra = dict(extra or {})
        # Attach block ID if we're inside a block
        if self._block_stack:
            bid = self._block_stack[-1]
            merged_extra["blockId"] = bid
            merged_extra["blockType"] = self._block_labels.get(bid, "")
        node = {
            "id": nid,
            "type": ntype,
            "data": {
                "label": label,
                "nodeType": ntype,
                "funcName": func_name,
                "lineNo": line_no,
                **merged_extra,
            },
            "position": {"x": 0, "y": 0},  # placeholder; frontend lays out
        }
        self.nodes.append(node)
        return nid

    def add_edge(self, source: str, target: str,
                 label: str = "",
                 edge_type: str = "default") -> None:
        # Avoid self-loops unless they are intentional loop-back edges
        self.edges.append({
            "id": f"e{source}-{target}-{len(self.edges)}",
            "source": source,
            "target": target,
            "label": label,
            "type": edge_type,
            "animated": edge_type == "loop",
        })

    # ── main entry points ────────────────────────────────────────────────

    def parse_source(self, source: str, filepath: str = "") -> dict:
        """Parse Python source into a file-level flow graph.

        Returns a dict with keys: nodes, edges, functions (list of defined
        function names), errors (list of parse errors).
        """
        self._counter = 0
        self.nodes = []
        self.edges = []
        self._source = source

        errors = []

        try:
            tree = ast.parse(source)
        except SyntaxError as e:
            errors.append({
                "line": e.lineno,
                "offset": e.offset,
                "msg": e.msg,
            })
            # Try to extract function defs with regex for partial parsing
            functions = self._extract_functions_regex(source)
            tree = self._build_partial_tree(functions, source)

            if not functions:
                return {
                    "nodes": [self._error_node(str(e))],
                    "edges": [],
                    "functions": [],
                    "errors": errors,
                }

        # First pass: collect function definitions
        self._collect_definitions(tree, filepath)

        # Build file-level graph (top-level statements + function/class entry points)
        top_stmts = []
        func_nodes = []
        class_nodes = []

        for stmt in tree.body:
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_nodes.append(stmt)
            elif isinstance(stmt, ast.ClassDef):
                class_nodes.append(stmt)
            else:
                top_stmts.append(stmt)

        if top_stmts:
            first, exits = self._visit_block(top_stmts)
        else:
            first = None
            exits = []

        # Add function entry nodes at the top level
        for func_def in func_nodes:
            entry_id = self.add_node(
                "function",
                f"def {func_def.name}(...)",
                func_name=func_def.name,
                line_no=func_def.lineno,
                extra={"expandable": True, "filepath": filepath},
            )
            if first is None:
                first = entry_id
            else:
                for exit_id in (exits or [first]):
                    self.add_edge(exit_id, entry_id)

        # Add class entry nodes at the top level
        for class_def in class_nodes:
            entry_id = self.add_node(
                "classNode",
                f"class {class_def.name}",
                func_name=class_def.name,
                line_no=class_def.lineno,
                extra={"expandable": True, "filepath": filepath, "isClass": True},
            )
            if first is None:
                first = entry_id
            else:
                for exit_id in (exits or [first]):
                    self.add_edge(exit_id, entry_id)

        # Build per-function sub-graphs (stored for drill-down)
        for func_def in func_nodes:
            fname = func_def.name
            qual = f"{filepath}:{fname}" if filepath else fname
            self._all_function_defs[qual] = {
                "name": fname,
                "filepath": filepath,
                "lineno": func_def.lineno,
                "end_lineno": getattr(func_def, 'end_lineno', func_def.lineno + 1),
                "ast_node": func_def,
            }
            if filepath not in self._file_function_map:
                self._file_function_map[filepath] = []
            self._file_function_map[filepath].append(fname)

        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "blocks": self._collect_blocks(),
            "functions": [
                {"name": n, "filepath": filepath, "lineno": d["lineno"]}
                for n, d in self._all_function_defs.items()
            ],
            "errors": errors,
        }

    def parse_function(self, func_name: str, filepath: str = "",
                       max_depth: int = 0,
                       enable_struct_groups: bool = False,
                       enable_chunk_groups: bool = False,
                       _current_depth: int = 0,
                       _visited: Optional[set] = None) -> dict:
        """Parse a specific function's internal flow graph.

        Args:
            func_name: Name of the function to parse.
            filepath: Optional file path for disambiguation.
            max_depth: How many levels of called functions to expand (0 = none).
            _current_depth: Internal depth tracker.
            _visited: Internal set to prevent infinite recursion.

        Returns a dict with nodes, edges for the function's internal flow.
        """
        if _visited is None:
            _visited = set()

        qual = f"{filepath}:{func_name}" if filepath else func_name
        if qual in self._all_function_defs:
            qual_key = qual
        else:
            # Try to find by name only
            matches = [k for k in self._all_function_defs if k.endswith(f":{func_name}") or k == func_name]
            if not matches:
                return {"nodes": [self._error_node(f"Function '{func_name}' not found")], "edges": []}
            qual_key = matches[0]

        if qual_key in _visited:
            return {"nodes": [self._error_node(f"Recursive call to {func_name}")], "edges": []}
        _visited.add(qual_key)

        info = self._all_function_defs[qual_key]
        func_def = info["ast_node"]

        # Reset for this function
        saved_nodes = self.nodes
        saved_edges = self.edges
        saved_counter = self._counter
        saved_block_stack = self._block_stack
        saved_block_info = self._block_info
        saved_block_labels = self._block_labels
        saved_next_block_id = self._next_block_id
        saved_struct = self.enable_struct_groups
        saved_chunk = self.enable_chunk_groups
        saved_comments = self._comments
        saved_comment_cursor = self._comment_cursor
        self.nodes = []
        self.edges = []
        self._counter = 0
        self._block_stack = []
        self._block_info = {}
        self._block_labels = {}
        self._next_block_id = 0
        self.enable_struct_groups = enable_struct_groups
        self.enable_chunk_groups = enable_chunk_groups
        self._comments = []
        self._comment_cursor = 0

        # Extract comments from source (needed for comment injection)
        self._extract_comments(self._source)

        # Split comments: above-function vs inside-function
        func_end = getattr(func_def, 'end_lineno', func_def.lineno)
        all_comments = list(self._comments)

        # Helper: check if lines between comment_end and func_start are blank
        source_lines = self._source.split('\n')
        def _is_blank_line(ln: int) -> bool:
            if ln < 0 or ln >= len(source_lines):
                return True
            return source_lines[ln].strip() == ''

        above_comments = []
        inside_comments = []
        for c in all_comments:
            if c['start'] >= func_def.lineno and c['start'] <= func_end:
                inside_comments.append(c)
            elif c['end'] < func_def.lineno and not c['is_docstring']:
                # Check all lines from comment end to def start are blank
                gap_blank = all(_is_blank_line(l) for l in range(c['end'], func_def.lineno - 1))
                if gap_blank:
                    above_comments.append(c)
            # else: comment elsewhere in file — skip

        # Emit above-function comments (they appear ABOVE the entry node)
        self._comments = above_comments
        self._comment_cursor = 0
        cmt_first, cmt_exits = self._emit_comments_before(10**9)
        self._comments = []
        self._comment_cursor = 0

        try:
            # Build function signature node
            args_str = self._format_args(func_def.args)
            entry_id = self.add_node(
                "entry",
                f"{func_def.name}({args_str})",
                func_name=func_def.name,
                line_no=func_def.lineno,
                extra={"signature": True},
            )

            # Chain above-function comments → entry node
            if cmt_first:
                for exit_id in cmt_exits:
                    self.add_edge(exit_id, entry_id)

            # Set remaining comments for the function body
            self._comments = inside_comments
            self._comment_cursor = 0

            # Process function body
            body_first, body_exits = self._visit_block(func_def.body)

            if body_first:
                self.add_edge(entry_id, body_first)

            # Add an exit node
            exit_id = self.add_node(
                "exit",
                f"return",
                func_name=func_def.name,
                line_no=getattr(func_def, 'end_lineno', func_def.lineno),
                extra={"endpoint": True},
            )

            for exit_src in (body_exits or [entry_id]):
                self.add_edge(exit_src, exit_id)

            # Optionally expand called functions
            if max_depth > _current_depth:
                self._expand_calls(max_depth, _current_depth + 1, _visited)

            result = {
                "nodes": self.nodes,
                "edges": self.edges,
                "function_name": func_def.name,
                "filepath": filepath,
                "blocks": self._collect_blocks(),
            }

            # Run a simple layout
            self._simple_layout(result["nodes"])

            return result

        finally:
            self.nodes = saved_nodes
            self.edges = saved_edges
            self._counter = saved_counter
            self._block_stack = saved_block_stack
            self._block_info = saved_block_info
            self._block_labels = saved_block_labels
            self._next_block_id = saved_next_block_id
            self.enable_struct_groups = saved_struct
            self.enable_chunk_groups = saved_chunk

    def parse_class(self, class_name: str, filepath: str = "",
                    enable_struct_groups: bool = False,
                    enable_chunk_groups: bool = False) -> dict:
        """Parse a class definition into a member-level flow graph.

        Shows class variables in order, then methods (expandable) at the same level.
        """
        qual = f"{filepath}:{class_name}" if filepath else class_name
        if qual not in self._all_class_defs:
            # Try name-only match
            matches = [k for k in self._all_class_defs if k.endswith(f":{class_name}") or k == class_name]
            if not matches:
                return {"nodes": [self._error_node(f"Class '{class_name}' not found")], "edges": []}
            qual = matches[0]

        info = self._all_class_defs[qual]
        class_def = info["ast_node"]

        # Reset
        saved_nodes = self.nodes; saved_edges = self.edges; saved_counter = self._counter
        saved_block_stack = self._block_stack; saved_block_info = self._block_info
        saved_block_labels = self._block_labels; saved_next_block_id = self._next_block_id
        saved_struct = self.enable_struct_groups; saved_chunk = self.enable_chunk_groups
        self.nodes = []; self.edges = []; self._counter = 0
        self._block_stack = []; self._block_info = {}; self._block_labels = {}
        self._next_block_id = 0
        self.enable_struct_groups = enable_struct_groups
        self.enable_chunk_groups = enable_chunk_groups

        try:
            # Class entry
            class_entry = self.add_node("entry", f"class {class_name}",
                                        func_name=class_name, line_no=class_def.lineno,
                                        extra={"signature": True, "isClassEntry": True})

            prev_id = class_entry  # for variable chain
            has_content = False

            for item in class_def.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # Method — sibling of class entry (not in variable chain)
                    args_str = self._format_args(item.args)
                    mid = self.add_node("function", f"def {item.name}({args_str})",
                                        func_name=item.name, line_no=item.lineno,
                                        extra={"expandable": True, "callName": f"{class_name}.{item.name}"})
                    self.add_edge(class_entry, mid)  # connect directly to class, not prev_id
                    has_content = True
                elif isinstance(item, ast.Assign):
                    label = ast.unparse(item) if hasattr(ast, 'unparse') else "<assign>"
                    if len(label) > 80:
                        label = label[:77] + "..."
                    nid = self.add_node("statement", label, line_no=item.lineno)
                    self.add_edge(prev_id, nid)
                    prev_id = nid  # chain variables sequentially
                    has_content = True
                elif isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                    pass  # skip docstring
                else:
                    try:
                        label = ast.unparse(item) if hasattr(ast, 'unparse') else f"<{type(item).__name__}>"
                    except Exception:
                        label = f"<{type(item).__name__}>"
                    if len(label) > 80:
                        label = label[:77] + "..."
                    nid = self.add_node("statement", label, line_no=getattr(item, 'lineno', 0))
                    self.add_edge(prev_id, nid)
                    prev_id = nid
                    has_content = True

            if not has_content:
                nid = self.add_node("statement", "pass", extra={"empty": True})
                self.add_edge(prev_id, nid)

            result = {
                "nodes": self.nodes,
                "edges": self.edges,
                "class_name": class_name,
                "filepath": filepath,
            }
            self._simple_layout(result["nodes"])
            return result
        finally:
            self.nodes = saved_nodes; self.edges = saved_edges
            self._counter = saved_counter
            self._block_stack = saved_block_stack
            self._block_info = saved_block_info
            self._block_labels = saved_block_labels
            self._next_block_id = saved_next_block_id
            self.enable_struct_groups = saved_struct
            self.enable_chunk_groups = saved_chunk

    def parse_project(self, root_dir: str) -> dict:
        """Build a project-level call graph across all Python files."""
        py_files = list(Path(root_dir).rglob("*.py"))
        # Filter out __pycache__, .venv, node_modules, etc.
        exclude_dirs = {'__pycache__', '.venv', 'venv', 'node_modules', '.git',
                        'dist', 'build', '.tox', 'site-packages'}
        py_files = [f for f in py_files
                    if not set(f.parts).intersection(exclude_dirs)]

        # Parse each file
        all_funcs: Dict[str, dict] = {}  # qual_name -> info
        call_graph: List[Tuple[str, str]] = []  # (caller, callee)

        for fpath in py_files:
            try:
                source = fpath.read_text(encoding='utf-8', errors='replace')
            except Exception:
                continue

            try:
                tree = ast.parse(source)
            except SyntaxError:
                continue

            rel_path = str(fpath.relative_to(root_dir))

            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    qual = f"{rel_path}:{node.name}"
                    all_funcs[qual] = {
                        "name": node.name,
                        "filepath": rel_path,
                        "lineno": node.lineno,
                    }

                    # Find calls within this function
                    for child in ast.walk(node):
                        if isinstance(child, ast.Call):
                            called = self._get_call_name(child)
                            if called:
                                # Find the callee
                                for q, info in all_funcs.items():
                                    if info["name"] == called:
                                        call_graph.append((qual, q))
                                        break

        # Build project graph
        self.nodes = []
        self.edges = []
        self._counter = 0

        for qual, info in all_funcs.items():
            self.add_node(
                "function",
                info["name"],
                func_name=info["name"],
                line_no=info["lineno"],
                extra={
                    "filepath": info["filepath"],
                    "expandable": True,
                    "projectView": True,
                },
            )

        for caller, callee in call_graph:
            caller_node = self._find_node_by_name(all_funcs[caller]["name"])
            callee_node = self._find_node_by_name(all_funcs[callee]["name"])
            if caller_node and callee_node and caller_node != callee_node:
                self.add_edge(caller_node, callee_node, "calls", "call")

        self._simple_layout(self.nodes)

        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "functions": list(all_funcs.values()),
            "file_count": len(py_files),
        }

    # ── AST visitors ────────────────────────────────────────────────────

    def _visit_block(self, stmts: list) -> Tuple[Optional[str], List[str]]:
        """Visit a block of statements.

        Returns (first_node_id, list_of_exit_node_ids).
        """
        if not stmts:
            nid = self.add_node("statement", "pass", extra={"empty": True})
            return nid, [nid]

        results: List[Tuple[str, List[str]]] = []

        # Helper: emit pending comments then visit a statement
        def _visit_with_comments(stmt):
            cmt_first, cmt_exits = self._emit_comments_before(getattr(stmt, 'lineno', 0))
            if cmt_first:
                results.append((cmt_first, cmt_exits))
            e, x = self._visit_stmt(stmt)
            if e:
                results.append((e, x))

        # Chunk grouping: detect consecutive same-subtype statements while visiting
        if self.enable_chunk_groups and len(stmts) >= 2:
            i = 0
            while i < len(stmts):
                subtype = self._stmt_subtype(stmts[i])
                if not subtype:
                    _visit_with_comments(stmts[i])
                    i += 1
                    continue

                j = i + 1
                while j < len(stmts) and self._stmt_subtype(stmts[j]) == subtype:
                    j += 1

                if j - i >= 2:
                    label_map = {"init": "Initialization", "import": "Imports"}
                    label = label_map.get(subtype, subtype.capitalize())
                    self._start_block(subtype, label)
                    for k in range(i, j):
                        _visit_with_comments(stmts[k])
                    self._end_block()
                else:
                    for k in range(i, j):
                        _visit_with_comments(stmts[k])

                i = j
        else:
            for stmt in stmts:
                _visit_with_comments(stmt)

        if not results:
            nid = self.add_node("statement", "pass", extra={"empty": True})
            return nid, [nid]

        # Chain results together, skip chaining FROM break/continue;
        # collect ALL break/continue exits for the caller to wire.
        first = results[0][0]
        for i in range(len(results) - 1):
            for exit_id in results[i][1]:
                kind = self._is_break_or_continue(exit_id)
                if kind == 'break':
                    self._collected_breaks.append(exit_id)
                elif kind == 'continue':
                    self._collected_continues.append(exit_id)
                else:
                    self.add_edge(exit_id, results[i + 1][0])

        # Also check last result's exits
        for exit_id in results[-1][1]:
            kind = self._is_break_or_continue(exit_id)
            if kind == 'break':
                self._collected_breaks.append(exit_id)
            elif kind == 'continue':
                self._collected_continues.append(exit_id)

        return first, results[-1][1]

    def _is_break_or_continue(self, node_id: str) -> Optional[str]:
        """Returns 'break', 'continue', or None."""
        for n in self.nodes:
            if n['id'] == node_id:
                t = n['data']['nodeType']
                return t if t in ('break', 'continue') else None
        return None

    # ── chunk detection helpers ──────────────────────────────────────────

    def _stmt_subtype(self, stmt: ast.AST) -> str:
        """Return the subtype of a statement for chunk grouping, or empty string."""
        if isinstance(stmt, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            return "init"
        if isinstance(stmt, (ast.Import, ast.ImportFrom)):
            return "import"
        return ""

    def _wrap_chunks(self, stmts: list) -> list:
        """Wrap consecutive same-subtype statements in chunk blocks.

        Returns a modified list where chunks are replaced with a single
        sentinel statement that triggers block start/end.
        """
        if not stmts:
            return stmts

        result = []
        i = 0
        while i < len(stmts):
            subtype = self._stmt_subtype(stmts[i])
            if not subtype:
                result.append(stmts[i])
                i += 1
                continue

            # Find consecutive same-subtype statements
            j = i + 1
            while j < len(stmts) and self._stmt_subtype(stmts[j]) == subtype:
                j += 1

            if j - i >= 2:
                # Wrap in a chunk block
                label_map = {"init": "Initialization", "import": "Imports"}
                label = label_map.get(subtype, subtype.capitalize())
                block_id = self._start_block(subtype, label)
                for k in range(i, j):
                    result.append(stmts[k])
                self._end_block()
            else:
                for k in range(i, j):
                    result.append(stmts[k])

            i = j

        return result

    def _visit_stmt(self, stmt: ast.AST) -> Tuple[Optional[str], List[str]]:
        """Dispatch to the appropriate visitor based on statement type."""
        # Skip docstrings (already emitted as comment nodes)
        if (hasattr(stmt, 'lineno') and stmt.lineno in self._docstring_lines):
            return None, []
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return self._visit_nested_function(stmt)
        elif isinstance(stmt, ast.If):
            return self._visit_if(stmt)
        elif isinstance(stmt, (ast.For, ast.AsyncFor)):
            return self._visit_for(stmt)
        elif isinstance(stmt, (ast.While,)):
            return self._visit_while(stmt)
        elif isinstance(stmt, ast.Try):
            return self._visit_try(stmt)
        elif isinstance(stmt, ast.With):
            return self._visit_with(stmt)
        elif isinstance(stmt, ast.Match):
            return self._visit_match(stmt)
        elif isinstance(stmt, ast.Return):
            label = self._format_return(stmt)
            extra = {"return": True}
            ival = self._extract_inspect(stmt.value)
            if ival:
                extra["inspect"] = {"kind": "return", "value": ival}
            nid = self.add_node("exit", label if label else "return",
                                line_no=stmt.lineno, extra=extra)
            return nid, [nid]
        elif isinstance(stmt, ast.Raise):
            label = self._format_raise(stmt)
            nid = self.add_node("statement", label, line_no=stmt.lineno,
                                extra={"raise": True})
            return nid, [nid]
        elif isinstance(stmt, ast.Break):
            nid = self.add_node("break", "break", line_no=stmt.lineno,
                                extra={"break": True})
            return nid, [nid]
        elif isinstance(stmt, ast.Continue):
            nid = self.add_node("continue", "continue", line_no=stmt.lineno,
                                extra={"continue": True})
            return nid, [nid]
        elif isinstance(stmt, ast.Pass):
            nid = self.add_node("statement", "pass", line_no=stmt.lineno,
                                extra={"empty": True})
            return nid, [nid]
        elif isinstance(stmt, ast.Assert):
            label = self._format_assert(stmt)
            nid = self.add_node("statement", label, line_no=stmt.lineno)
            return nid, [nid]
        else:
            # Generic statement / expression
            label = self._format_generic(stmt)
            nid = self.add_node("statement", label, line_no=getattr(stmt, 'lineno', 0))

            # Check if it's a function call to a known function
            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                call_name = self._get_call_name(stmt.value)
                if call_name in self._get_defined_names():
                    nid = self.add_node("call", label, line_no=stmt.lineno,
                                        extra={"callName": call_name, "expandable": True})
                else:
                    ival = self._extract_inspect(stmt.value)
                    extra = {}
                    if ival:
                        extra["inspect"] = {"kind": "call", "call": ival}
                    nid = self.add_node("statement", label, line_no=stmt.lineno, extra=extra)

            return nid, [nid]

    def _visit_nested_function(self, stmt: ast.FunctionDef) -> Tuple[str, List[str]]:
        """Visit a nested function definition (defined inside another function)."""
        args_str = self._format_args(stmt.args)
        label = f"def {stmt.name}({args_str})"
        entry = self.add_node("function", label, func_name=stmt.name,
                              line_no=stmt.lineno,
                              extra={"nested": True, "expandable": True})
        body_first, body_exits = self._visit_block(stmt.body)
        if body_first:
            self.add_edge(entry, body_first)
        exit_n = self.add_node("exit", f"return from {stmt.name}",
                               line_no=getattr(stmt, 'end_lineno', stmt.lineno))
        for e in (body_exits or [entry]):
            self.add_edge(e, exit_n)
        return entry, [exit_n]

    def _visit_if(self, stmt: ast.If) -> Tuple[str, List[str]]:
        """Visit an if/elif/else statement."""
        cond_text = ast.unparse(stmt.test) if hasattr(ast, 'unparse') else self._node_text(stmt.test)
        cond_id = self.add_node("condition", cond_text, line_no=stmt.lineno)

        # True branch
        self._start_block("if", "if")
        true_first, true_exits = self._visit_block(stmt.body)
        self._end_block()
        self.add_edge(cond_id, true_first, "True", "true")

        # False / elif / else branch
        false_exits: List[str] = []
        if stmt.orelse:
            # Check if it's elif
            if len(stmt.orelse) == 1 and isinstance(stmt.orelse[0], ast.If):
                # It's an elif - handled recursively (this is the recursive case)
                false_first, false_exits = self._visit_stmt(stmt.orelse[0])
                self.add_edge(cond_id, false_first, "False", "false")
            else:
                # Regular else
                self._start_block("else", "else")
                false_first, false_exits = self._visit_block(stmt.orelse)
                self._end_block()
                self.add_edge(cond_id, false_first, "False", "false")
        else:
            # No else - false branch goes to a merge point or falls through
            false_exits = [cond_id]

        # Merge exits
        all_exits = true_exits + false_exits
        return cond_id, all_exits

    def _visit_for(self, stmt: ast.For) -> Tuple[str, List[str]]:
        """Visit a for loop."""
        target = ast.unparse(stmt.target) if hasattr(ast, 'unparse') else self._node_text(stmt.target)
        iter_src = ast.unparse(stmt.iter) if hasattr(ast, 'unparse') else self._node_text(stmt.iter)
        loop_id = self.add_node("loop", f"for {target} in {iter_src}", line_no=stmt.lineno)

        # Save/clear break/continue collectors for this loop
        saved_breaks = self._collected_breaks
        saved_continues = self._collected_continues
        self._collected_breaks = []
        self._collected_continues = []

        self._start_block("for", "for body")
        body_first, body_exits = self._visit_block(stmt.body)
        self._end_block()
        if body_first:
            self.add_edge(loop_id, body_first, "body", "default")

        # Wire collected breaks/continues
        loop_breaks = list(self._collected_breaks)
        for exit_id in self._collected_continues:
            self.add_edge(exit_id, loop_id, "continue", "loop")

        # Resolve break nodes: change type so parent _visit_block chains them normally
        for b in loop_breaks:
            for node in self.nodes:
                if node['id'] == b:
                    node['data']['nodeType'] = 'statement'
                    node['type'] = 'statement'

        # Restore parent's collectors (for break in nested loops)
        self._collected_breaks = saved_breaks
        self._collected_continues = saved_continues

        # Normal exits: loop back to header
        for exit_id in body_exits:
            if not self._is_break_or_continue(exit_id):
                self.add_edge(exit_id, loop_id, "next", "loop")

        # Orelse (runs if no break)
        orelse_exits: List[str] = []
        if stmt.orelse:
            self._start_block("else", "for else")
            else_first, else_exits_list = self._visit_block(stmt.orelse)
            self._end_block()
            self.add_edge(loop_id, else_first, "no break", "default")
            orelse_exits = else_exits_list

        # Loop exits = orelse path + collected breaks from this loop
        exits = orelse_exits + loop_breaks if orelse_exits or loop_breaks else [loop_id]
        return loop_id, exits

    def _visit_while(self, stmt: ast.While) -> Tuple[str, List[str]]:
        """Visit a while loop."""
        cond_text = ast.unparse(stmt.test) if hasattr(ast, 'unparse') else self._node_text(stmt.test)
        loop_id = self.add_node("loop", f"while {cond_text}", line_no=stmt.lineno)

        saved_breaks = self._collected_breaks
        saved_continues = self._collected_continues
        self._collected_breaks = []
        self._collected_continues = []

        self._start_block("while", "while body")
        body_first, body_exits = self._visit_block(stmt.body)
        self._end_block()
        if body_first:
            self.add_edge(loop_id, body_first, "True", "true")

        loop_breaks = list(self._collected_breaks)
        for exit_id in self._collected_continues:
            self.add_edge(exit_id, loop_id, "continue", "loop")

        # Resolve break nodes
        for b in loop_breaks:
            for node in self.nodes:
                if node['id'] == b:
                    node['data']['nodeType'] = 'statement'
                    node['type'] = 'statement'

        self._collected_breaks = saved_breaks
        self._collected_continues = saved_continues

        for exit_id in body_exits:
            if not self._is_break_or_continue(exit_id):
                self.add_edge(exit_id, loop_id, "next", "loop")

        orelse_exits: List[str] = []
        if stmt.orelse:
            self._start_block("else", "while else")
            else_first, else_exits_list = self._visit_block(stmt.orelse)
            self._end_block()
            self.add_edge(loop_id, else_first, "False", "false")
            orelse_exits = else_exits_list

        exits = orelse_exits + loop_breaks if orelse_exits or loop_breaks else [loop_id]
        return loop_id, exits

    def _visit_try(self, stmt: ast.Try) -> Tuple[str, List[str]]:
        """Visit a try/except/finally block."""
        try_id = self.add_node("try", "try", line_no=stmt.lineno)

        # Try body
        self._start_block("try", "try")
        try_first, try_exits = self._visit_block(stmt.body)
        self._end_block()
        self.add_edge(try_id, try_first, "body", "default")

        all_exits: List[str] = list(try_exits)

        # Except handlers
        for handler in stmt.handlers:
            handler_label = "except"
            if handler.type:
                type_text = ast.unparse(handler.type) if hasattr(ast, 'unparse') else self._node_text(handler.type)
                handler_label = f"except {type_text}"
            if handler.name:
                handler_label += f" as {handler.name}"

            exc_id = self.add_node("except", handler_label, line_no=handler.lineno)
            self.add_edge(try_id, exc_id, "on error", "exception")

            self._start_block("except", "except handler")
            exc_first, exc_exits = self._visit_block(handler.body)
            self._end_block()
            if exc_first:
                self.add_edge(exc_id, exc_first)
            all_exits.extend(exc_exits)

        # Else (runs if no exception)
        if stmt.orelse:
            else_id = self.add_node("statement", "else (no exception)",
                                    line_no=getattr(stmt, 'end_lineno', stmt.lineno))
            for ex in try_exits:
                self.add_edge(ex, else_id)
            self._start_block("else", "try else")
            else_first, else_exits = self._visit_block(stmt.orelse)
            self._end_block()
            if else_first:
                self.add_edge(else_id, else_first)
            all_exits.extend(else_exits)

        # Finally
        if stmt.finalbody:
            finally_id = self.add_node("statement", "finally",
                                       line_no=getattr(stmt, 'end_lineno', stmt.lineno))
            for ex in all_exits:
                self.add_edge(ex, finally_id)
            self._start_block("finally", "finally")
            fin_first, fin_exits = self._visit_block(stmt.finalbody)
            self._end_block()
            if fin_first:
                self.add_edge(finally_id, fin_first)
            all_exits = fin_exits

        return try_id, all_exits

    def _visit_with(self, stmt: ast.With) -> Tuple[str, List[str]]:
        """Visit a with statement."""
        items_text = []
        for item in stmt.items:
            ctx = ast.unparse(item.context_expr) if hasattr(ast, 'unparse') else self._node_text(item.context_expr)
            if item.optional_vars:
                var = ast.unparse(item.optional_vars) if hasattr(ast, 'unparse') else self._node_text(item.optional_vars)
                items_text.append(f"{var} = {ctx}")
            else:
                items_text.append(ctx)
        label = "with " + ", ".join(items_text)
        with_id = self.add_node("statement", label, line_no=stmt.lineno,
                                extra={"with": True})
        self._start_block("with", "with block")
        body_first, body_exits = self._visit_block(stmt.body)
        self._end_block()
        if body_first:
            self.add_edge(with_id, body_first)
        return with_id, body_exits

    def _visit_match(self, stmt: ast.Match) -> Tuple[str, List[str]]:
        """Visit a match/case statement (Python 3.10+)."""
        subj = ast.unparse(stmt.subject) if hasattr(ast, 'unparse') else self._node_text(stmt.subject)
        match_id = self.add_node("condition", f"match {subj}", line_no=stmt.lineno)
        all_exits: List[str] = []
        for i, case in enumerate(stmt.cases):
            pat = ast.unparse(case.pattern) if hasattr(ast, 'unparse') else self._node_text(case.pattern)
            if case.guard:
                guard = ast.unparse(case.guard) if hasattr(ast, 'unparse') else self._node_text(case.guard)
                pat += f" if {guard}"
            case_id = self.add_node("statement", f"case {pat}", line_no=case.pattern.lineno)
            self.add_edge(match_id, case_id, f"match {i + 1}", "default")
            self._start_block("match_case", f"case {pat[:40]}")
            case_first, case_exits = self._visit_block(case.body)
            self._end_block()
            if case_first:
                self.add_edge(case_id, case_first)
            all_exits.extend(case_exits)
        return match_id, all_exits

    # ── formatting helpers ──────────────────────────────────────────────

    def _format_args(self, args: ast.arguments) -> str:
        """Format function arguments for display."""
        parts = []

        # Positional args
        for arg in args.args:
            a = arg.arg
            if hasattr(arg, 'annotation') and arg.annotation:
                ann = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else self._node_text(arg.annotation)
                a += f": {ann}"
            parts.append(a)

        # Vararg (*args)
        if args.vararg:
            parts.append(f"*{args.vararg.arg}")

        # Keyword-only args
        for arg in args.kwonlyargs:
            a = arg.arg
            if hasattr(arg, 'annotation') and arg.annotation:
                ann = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else self._node_text(arg.annotation)
                a += f": {ann}"
            parts.append(a)

        # Kwarg (**kwargs)
        if args.kwarg:
            parts.append(f"**{args.kwarg.arg}")

        return ", ".join(parts) if parts else ""

    def _format_return(self, stmt: ast.Return) -> str:
        if stmt.value:
            val = ast.unparse(stmt.value) if hasattr(ast, 'unparse') else self._node_text(stmt.value)
            return f"return {val}"
        return "return"

    def _format_raise(self, stmt: ast.Raise) -> str:
        if stmt.exc:
            exc = ast.unparse(stmt.exc) if hasattr(ast, 'unparse') else self._node_text(stmt.exc)
            return f"raise {exc}"
        return "raise"

    def _format_assert(self, stmt: ast.Assert) -> str:
        test = ast.unparse(stmt.test) if hasattr(ast, 'unparse') else self._node_text(stmt.test)
        return f"assert {test}"

    def _format_generic(self, stmt: ast.AST) -> str:
        """Format a generic statement for display."""
        try:
            if hasattr(ast, 'unparse'):
                text = ast.unparse(stmt)
            else:
                text = self._node_text(stmt)
            # Truncate long statements
            if len(text) > 120:
                text = text[:117] + "..."
            return text
        except Exception:
            return f"<{type(stmt).__name__}>"

    def _extract_inspect(self, node: ast.AST) -> Optional[dict]:
        """Extract a structured JSON representation of an AST value node
        for the 'Inspect' feature (dicts, lists, return values, calls)."""
        if node is None:
            return None
        try:
            if isinstance(node, ast.Constant):
                return {"type": "literal", "value": node.value}
            if isinstance(node, ast.Dict):
                keys = [self._extract_inspect(k) for k in node.keys]
                vals = [self._extract_inspect(v) for v in node.values]
                return {"type": "dict", "items": [{"key": k, "value": v} for k, v in zip(keys, vals)]}
            if isinstance(node, (ast.List, ast.Tuple)):
                return {"type": "list" if isinstance(node, ast.List) else "tuple",
                        "items": [self._extract_inspect(e) for e in node.elts]}
            if isinstance(node, ast.Set):
                return {"type": "set", "items": [self._extract_inspect(e) for e in node.elts]}
            if isinstance(node, ast.Call):
                name = self._get_call_name(node)
                args = [self._extract_inspect(a) for a in node.args]
                return {"type": "call", "name": name, "args": args}
            if isinstance(node, ast.Name):
                return {"type": "variable", "name": node.id}
            if isinstance(node, ast.Attribute):
                return {"type": "attribute", "name": ast.unparse(node) if hasattr(ast, 'unparse') else self._node_text(node)}
            if isinstance(node, ast.BinOp):
                text = ast.unparse(node) if hasattr(ast, 'unparse') else self._node_text(node)
                return {"type": "expression", "text": text}
            # Fallback: string representation
            text = ast.unparse(node) if hasattr(ast, 'unparse') else self._node_text(node)
            return {"type": "expression", "text": text}
        except Exception:
            return None

    def _node_text(self, node: ast.AST) -> str:
        """Fallback for Python < 3.9 without ast.unparse."""
        import astor  # type: ignore
        return astor.to_source(node).strip()

    def _get_call_name(self, call: ast.Call) -> Optional[str]:
        """Extract the simple name of a function call."""
        func = call.func
        if isinstance(func, ast.Name):
            return func.id
        elif isinstance(func, ast.Attribute):
            return func.attr
        return None

    def _get_defined_names(self) -> set:
        """Get set of all defined function names."""
        return {info["name"] for info in self._all_function_defs.values()}

    def _collect_definitions(self, tree: ast.AST, filepath: str) -> None:
        """First pass: collect all function and class definitions."""
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                qual = f"{filepath}:{node.name}" if filepath else node.name
                self._all_function_defs[qual] = {
                    "name": node.name,
                    "filepath": filepath,
                    "lineno": node.lineno,
                    "end_lineno": getattr(node, 'end_lineno', node.lineno + 1),
                    "ast_node": node,
                }
            elif isinstance(node, ast.ClassDef):
                qual = f"{filepath}:{node.name}" if filepath else node.name
                self._all_class_defs[qual] = {
                    "name": node.name,
                    "filepath": filepath,
                    "lineno": node.lineno,
                    "ast_node": node,
                }
                # Register class methods as drill-down targets
                for body_item in node.body:
                    if isinstance(body_item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        mname = body_item.name
                        qualified = f"{node.name}.{mname}"
                        mqual = f"{filepath}:{qualified}" if filepath else qualified
                        self._all_function_defs[mqual] = {
                            "name": qualified,
                            "filepath": filepath,
                            "lineno": body_item.lineno,
                            "end_lineno": getattr(body_item, 'end_lineno', body_item.lineno + 1),
                            "ast_node": body_item,
                            "class_name": node.name,
                        }

    def _expand_calls(self, max_depth: int, current_depth: int,
                      _visited: set) -> None:
        """Expand function call nodes by inlining the called function's flow.

        For now, this just marks call nodes - full expansion is handled
        by the frontend via separate API calls.
        """
        pass  # Frontend handles drill-down via API

    # ── fallback / error handling ────────────────────────────────────────

    def _extract_functions_regex(self, source: str) -> List[dict]:
        """Extract function definitions using regex when AST parsing fails."""
        functions = []
        pattern = re.compile(
            r'^\s*(async\s+)?def\s+(\w+)\s*\([^)]*\)\s*(->\s*[^:]+)?\s*:',
            re.MULTILINE,
        )
        for match in pattern.finditer(source):
            functions.append({
                "name": match.group(2),
                "lineno": source[:match.start()].count('\n') + 1,
                "async": bool(match.group(1)),
            })
        return functions

    def _build_partial_tree(self, functions: List[dict],
                            source: str) -> ast.Module:
        """Build a partial AST when full parsing fails."""
        body = []
        for func in functions:
            # Create a minimal function def stub
            func_def = ast.FunctionDef(
                name=func["name"],
                args=ast.arguments(
                    posonlyargs=[], args=[], vararg=None,
                    kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[],
                ),
                body=[ast.Pass()],
                decorator_list=[],
                lineno=func["lineno"],
            )
            body.append(func_def)
        return ast.Module(body=body, type_ignores=[])

    def _error_node(self, msg: str) -> dict:
        return {
            "id": "error",
            "type": "error",
            "data": {"label": msg, "nodeType": "error"},
            "position": {"x": 0, "y": 0},
        }

    # ── simple layout ────────────────────────────────────────────────────

    def _simple_layout(self, nodes: List[dict]) -> None:
        """Assign x,y positions using a simple topological sort."""
        # This is a basic layout; the frontend uses dagre for proper layout
        # Just ensure nodes don't all stack at 0,0
        for i, node in enumerate(nodes):
            node["position"] = {"x": 50, "y": i * 80}

        # Overwrite with dagre-compatible positions
        # The frontend will re-layout anyway, so just spread them out
        rows_per_type = {
            "entry": 0, "function": 1, "condition": 2,
            "loop": 3, "try": 4, "except": 5,
            "statement": 6, "call": 7, "exit": 8, "pass": 9,
        }
        for node in nodes:
            ntype = node.get("data", {}).get("nodeType", "statement")
            row = rows_per_type.get(ntype, 6)
            node["position"]["x"] = 200 + row * 250

    def _find_node_by_name(self, name: str) -> Optional[str]:
        """Find a node id by function name."""
        for node in self.nodes:
            if node.get("data", {}).get("funcName") == name:
                return node["id"]
        return None

    def get_defined_functions(self) -> List[dict]:
        """Return all defined functions after parsing."""
        return [
            {"name": info["name"], "filepath": info["filepath"],
             "lineno": info["lineno"], "end_lineno": info["end_lineno"]}
            for info in self._all_function_defs.values()
        ]


# ── module-level convenience ──────────────────────────────────────────────

def parse_python_code(source: str, filepath: str = "") -> dict:
    """Quick parse of Python source code."""
    builder = FlowGraphBuilder()
    return builder.parse_source(source, filepath)


def parse_function(source: str, func_name: str,
                   max_depth: int = 0) -> dict:
    """Parse a specific function from source code."""
    builder = FlowGraphBuilder()
    builder.parse_source(source)
    return builder.parse_function(func_name, max_depth=max_depth)


def parse_project_directory(root_dir: str) -> dict:
    """Parse all Python files in a directory for project-level view."""
    builder = FlowGraphBuilder()
    return builder.parse_project(root_dir)
