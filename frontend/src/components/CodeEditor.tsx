import React, { useRef, useCallback } from 'react';
import Editor, { type OnMount, type BeforeMount, loader } from '@monaco-editor/react';

// Dark theme
loader.init().then(monaco => {
  monaco.editor.defineTheme('flowchart-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6c6cf0', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a855f7' },
      { token: 'string', foreground: '22c55e' },
      { token: 'number', foreground: 'f59e0b' },
      { token: 'type', foreground: '3b82f6' },
      { token: 'function', foreground: '8b5cf6' },
    ],
    colors: {
      'editor.background': '#0a0a0f',
      'editor.foreground': '#e8e8f0',
      'editorLineNumber.foreground': '#484858',
      'editorCursor.foreground': '#6c6cf0',
      'editor.selectionBackground': '#6c6cf033',
      'editor.lineHighlightBackground': '#1a1a2822',
      'editorGutter.background': '#0a0a0f',
      'editor.selectionHighlightBackground': '#6c6cf022',
      'editorBracketMatch.background': '#6c6cf033',
      'editorBracketMatch.border': '#6c6cf0',
      'scrollbarSlider.background': '#2a2a3e',
      'scrollbarSlider.hoverBackground': '#3a3a5e',
      'scrollbarSlider.activeBackground': '#4a4a6e',
    },
  });
});

const DEFAULT_CODE = `def greet(name):
    """Say hello to someone."""
    if name:
        return f"Hello, {name}!"
    return "Hello, World!"

def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        print(a)
        a, b = b, a + b
    return a

class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, x):
        self.result += x
        return self.result

    def subtract(self, x):
        self.result -= x
        return self.result
`;

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorLineChange?: (line: number) => void;
  onEditorMount?: (editor: any) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, onCursorLineChange, onEditorMount }) => {
  const handleMount: OnMount = useCallback((editor, monaco) => {
    monaco.editor.setTheme('flowchart-dark');

    if (onEditorMount) onEditorMount(editor);

    // Cursor change
    const notify = (line: number) => onCursorLineChange?.(line);
    if (onCursorLineChange) {
      editor.onDidChangeCursorPosition((e) => notify(e.position.lineNumber));
      editor.onMouseDown((e) => {
        if (e.target.position) notify(e.target.position.lineNumber);
      });
    }

    // Ctrl+Enter to parse
    editor.addAction({
      id: 'parse-code',
      label: 'Parse & Visualize',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {},
    });
  }, [onCursorLineChange, onEditorMount]);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monaco.editor.setTheme('flowchart-dark');
  }, []);

  return (
    <Editor
      height="100%"
      language="python"
      theme="flowchart-dark"
      value={value}
      onChange={(v) => onChange(v || '')}
      onMount={handleMount}
      beforeMount={handleBeforeMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Consolas', monospace",
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false,
        padding: { top: 12 },
        bracketPairColorization: { enabled: true },
        autoClosingBrackets: 'always',
        tabSize: 4,
        insertSpaces: true,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        wordWrap: 'off',
        automaticLayout: true,
        fixedOverflowWidgets: true,
      }}
    />
  );
};

export default CodeEditor;
export { DEFAULT_CODE };
