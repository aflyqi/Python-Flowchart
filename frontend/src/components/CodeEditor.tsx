import React, { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onParse: () => void;
  loading: boolean;
  /** Fires when cursor moves to a new line (1-indexed) */
  onCursorLineChange?: (line: number) => void;
  /** Exposes the Monaco editor instance so parent can call revealLineInCenter etc. */
  onEditorMount?: (editor: editor.IStandaloneCodeEditor) => void;
}

const DEFAULT_CODE = `def run_conversation(self, user_message: str, system_message: str = None):
    """Run the main conversation loop."""
    messages = []
    if system_message:
        messages.append({"role": "system", "content": system_message})

    user_name = get_name(user_message)
    messages.append({"role": "user", "content": user_message})

    api_call_count = 0
    while api_call_count < self.max_iterations:
        response = self._call_api(messages)
        if response.tool_calls:
            for tool_call in response.tool_calls:
                result = execute_tool(tool_call)
                messages.append(result)
            api_call_count += 1
        else:
            return response.content

    return "Max iterations reached"

def get_name(message: str) -> str:
    """Extract user name from message."""
    if "name:" in message:
        return message.split("name:")[1].strip()
    return "Anonymous"

def execute_tool(tool_call):
    """Execute a single tool call."""
    try:
        if tool_call.name == "search":
            return search_handler(tool_call.args)
        elif tool_call.name == "read":
            return read_handler(tool_call.args)
        else:
            raise ValueError(f"Unknown tool: {tool_call.name}")
    except Exception as e:
        return {"error": str(e)}
`;

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  onParse,
  loading,
  onCursorLineChange,
  onEditorMount,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    // Expose editor to parent
    if (onEditorMount) {
      onEditorMount(editor);
    }

    // Ctrl+Enter to parse
    editor.addAction({
      id: 'parse-code',
      label: 'Parse & Visualize',
      keybindings: [2048 | 3], // Ctrl+Enter
      run: () => onParse(),
    });

    // Esc: close find widget (fixes Esc not working in some environments)
    editor.addAction({
      id: 'close-find-widget',
      label: 'Close Find Widget',
      keybindings: [9], // Esc
      run: (ed) => {
        ed.trigger('keyboard', 'closeFindWidget', null);
      },
    });

    // Track cursor position changes + mouse clicks
    const notify = (line: number) => {
      if (onCursorLineChange) onCursorLineChange(line);
    };
    if (onCursorLineChange) {
      editor.onDidChangeCursorPosition((e) => {
        notify(e.position.lineNumber);
      });
      // Also fire on mouse click for more reliable trigger
      editor.onMouseDown((e) => {
        if (e.target.position) notify(e.target.position.lineNumber);
      });
    }
  }, [onParse, onCursorLineChange, onEditorMount]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0d1117',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #21262d',
      }}>
        <span style={{
          color: '#8b949e',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          📝 Python Code
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#484f58', fontSize: 11 }}>
            Ctrl+Enter to parse
          </span>
          <button
            onClick={onParse}
            disabled={loading}
            style={{
              background: loading ? '#1f2937' : '#238636',
              color: loading ? '#484f58' : '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              transition: 'background 0.2s',
            }}
          >
            {loading ? '⏳ Parsing...' : '▶ Parse'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="python"
          value={value}
          onChange={(v) => onChange(v || '')}
          onMount={handleMount}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            folding: true,
            foldingStrategy: 'indentation',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 4,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            suggest: { showKeywords: true },
          }}
        />
      </div>
    </div>
  );
};

export { DEFAULT_CODE };
export default CodeEditor;
