import React, { useState, useEffect, useRef } from 'react';
import { X, Save, AlertTriangle, CheckCircle, Upload, Download, FileJson, RefreshCw, Clipboard } from 'lucide-react';
import { Card } from '../types';

interface CardEditorProps {
    isOpen: boolean;
    onClose: () => void;
    currentCards: Card[];
    packId: number;
    onSaveSuccess: (newCards: Card[]) => void;
}

export const CardEditor: React.FC<CardEditorProps> = ({
    isOpen,
    onClose,
    currentCards,
    packId,
    onSaveSuccess
}) => {
    const [jsonContent, setJsonContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isValid, setIsValid] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Prettify JSON on open
            setJsonContent(JSON.stringify(currentCards, null, 2));
            validateContent(JSON.stringify(currentCards, null, 2));
        }
    }, [isOpen, currentCards]);

    const generateId = () => {
        return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    };

    const validateContent = (content: string) => {
        try {
            if (!content.trim()) {
                setIsValid(false);
                setError("Content is empty");
                return false;
            }

            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed)) {
                throw new Error("Root must be an array of objects.");
            }

            parsed.forEach((item, idx) => {
                if (typeof item !== 'object' || item === null) throw new Error(`Item at index ${idx} is not an object`);

                // Type check
                if (!item.type) throw new Error(`Item at index ${idx} missing 'type'`);
                if (!['standard', 'quiz'].includes(item.type)) throw new Error(`Item at index ${idx} has invalid type '${item.type}' (must be 'standard' or 'quiz')`);

                // Specific validation
                if (item.type === 'standard') {
                    if (!item.question) throw new Error(`Standard Card at index ${idx} missing 'question'`);
                    if (!item.answer) throw new Error(`Standard Card at index ${idx} missing 'answer'`);
                } else if (item.type === 'quiz') {
                    if (!item.question) throw new Error(`Quiz Card at index ${idx} missing 'question'`);
                    if (!Array.isArray(item.options) || item.options.length < 2) throw new Error(`Quiz Card at index ${idx} must have 'options' array with at least 2 items`);
                    if (typeof item.correct_index !== 'number') throw new Error(`Quiz Card at index ${idx} missing 'correct_index'`);
                    if (item.correct_index < 0 || item.correct_index >= item.options.length) throw new Error(`Quiz Card at index ${idx} has invalid 'correct_index' (out of bounds)`);
                }
            });

            setIsValid(true);
            setError(null);
            return true;
        } catch (e: any) {
            setIsValid(false);
            setError(e.message);
            return false;
        }
    };

    const handleTextChange = (value: string) => {
        setJsonContent(value);
        validateContent(value);
    };

    // Advanced Loose JSON Parser - Handles LaTeX and common issues
    const parseLooseJSON = (str: string): any => {
        // Helper to fix LaTeX escape sequences in JSON strings
        const fixLatexEscapes = (text: string): string => {
            // JSON only allows: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
            // LaTeX uses things like \epsilon, \frac, etc. which are invalid JSON escapes
            // We need to double-escape backslashes that aren't valid JSON escapes

            let result = '';
            let i = 0;
            while (i < text.length) {
                if (text[i] === '\\' && i + 1 < text.length) {
                    const nextChar = text[i + 1];
                    // Valid JSON escapes
                    if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(nextChar)) {
                        result += text[i] + nextChar;
                        i += 2;
                    } else if (nextChar === 'u' && i + 5 < text.length && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
                        // Unicode escape \uXXXX
                        result += text.slice(i, i + 6);
                        i += 6;
                    } else {
                        // Invalid escape - double the backslash to make it literal
                        result += '\\\\' + nextChar;
                        i += 2;
                    }
                } else {
                    result += text[i];
                    i++;
                }
            }
            return result;
        };

        // First, try to fix LaTeX escapes in string values
        const fixJsonString = (jsonStr: string): string => {
            // Find all string values and fix escapes within them
            let result = '';
            let inString = false;
            let escapeNext = false;
            let currentString = '';
            let stringStart = -1;

            for (let i = 0; i < jsonStr.length; i++) {
                const char = jsonStr[i];

                if (escapeNext) {
                    if (inString) currentString += char;
                    else result += char;
                    escapeNext = false;
                    continue;
                }

                if (char === '\\') {
                    escapeNext = true;
                    if (inString) currentString += char;
                    else result += char;
                    continue;
                }

                if (char === '"' && !escapeNext) {
                    if (inString) {
                        // End of string - fix escapes and add
                        result += '"' + fixLatexEscapes(currentString) + '"';
                        currentString = '';
                        inString = false;
                    } else {
                        // Start of string
                        inString = true;
                        stringStart = i;
                    }
                    continue;
                }

                if (inString) {
                    currentString += char;
                } else {
                    result += char;
                }
            }

            return result;
        };

        // Try 1: Direct parse
        try {
            return JSON.parse(str);
        } catch (e1) {
            // Try 2: Fix LaTeX escapes
            try {
                const fixed = fixJsonString(str);
                return JSON.parse(fixed);
            } catch (e2) {
                // Try 3: More aggressive fixes
                let fixed = str.trim();

                // Handle concatenated objects
                if (fixed.match(/}\s*{/)) {
                    fixed = `[${fixed.replace(/}\s*{/g, '},{')}]`;
                }

                // Replace single quotes with double quotes
                fixed = fixed.replace(/'([^']+)'\s*:/g, '"$1":');
                fixed = fixed.replace(/:\s*'([^']+)'/g, ': "$1"');

                // Add quotes to unquoted keys
                fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

                // Remove trailing commas
                fixed = fixed.replace(/,\s*([\]}])/g, '$1');

                // Fix LaTeX escapes again
                fixed = fixJsonString(fixed);

                try {
                    return JSON.parse(fixed);
                } catch (e3) {
                    // Try 4: Wrap in array if single object
                    if (fixed.startsWith('{') && !fixed.startsWith('[')) {
                        try {
                            return JSON.parse('[' + fixed + ']');
                        } catch (e4) { }
                    }

                    throw new Error("Impossibile riparare il JSON. Controlla la sintassi manualmente.");
                }
            }
        }
    };

    const handleFormatAndFix = () => {
        try {
            // Use parseLooseJSON which handles LaTeX escapes and repairs common issues
            const parsed = parseLooseJSON(jsonContent);

            // Ensure it's an array
            const items = Array.isArray(parsed) ? parsed : [parsed];

            // Auto-fix: Add IDs if missing, ensure type exists
            const fixed = items.map((item: any) => ({
                ...item,
                id: item.id || generateId(),
                type: item.type || (item.options ? 'quiz' : 'standard')
            }));

            const formatted = JSON.stringify(fixed, null, 2);
            setJsonContent(formatted);
            validateContent(formatted);
            setError(null);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Errore durante la formattazione";
            setError(errorMsg);
            validateContent(jsonContent);
        }
    };

    const handlePaste = async () => {
        if (!navigator.clipboard) {
            setError("Clipboard API not supported. Please click the box and use Ctrl+V.");
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                // Auto-sanitize on paste
                try {
                    const parsed = parseLooseJSON(text);
                    // If parsed successfully, re-stringify to be pretty
                    const pretty = JSON.stringify(
                        Array.isArray(parsed) ? parsed : [parsed],
                        null,
                        2
                    );
                    setJsonContent(pretty);
                    validateContent(pretty);
                } catch (e) {
                    // If parsing failed even with loose parser, just paste raw text
                    // and let format&fix try later
                    setJsonContent(text);
                    validateContent(text);
                }
            } else {
                setError("Clipboard appears empty.");
            }
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
            setError("Browser blocked paste. Please click inside the editor and press Ctrl+V manually.");
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setJsonContent(content);
            validateContent(content);
            // Reset input so same file can be selected again if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const handleExport = () => {
        if (!isValid) return;
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slidepack_${packId}_cards.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleSave = async () => {
        if (!isValid) return;

        setIsSaving(true);
        try {
            let parsedCards = JSON.parse(jsonContent);

            // Ensure every card has an ID before sending
            parsedCards = parsedCards.map((c: any) => ({
                ...c,
                id: c.id || generateId()
            }));

            // Backend call
            const response = await fetch(`http://127.0.0.1:8000/slidepacks/${packId}/cards`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(parsedCards)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to save cards");
            }

            onSaveSuccess(parsedCards);
            onClose();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col h-[85vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <FileJson className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-neutral-800">Learning Objects Editor</h2>
                            <p className="text-sm text-neutral-500">Edit Flashcards & Quizzes JSON</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleFormatAndFix}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Auto-repair JSON formatted issues & Fix IDs"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Auto-Repair & Format
                        </button>
                        <div className="h-6 w-px bg-neutral-200 mx-1" />
                        <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition text-neutral-500 hover:text-neutral-800">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-5 py-3 bg-neutral-50 border-b flex gap-3">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".json"
                        className="hidden"
                    />
                    <button
                        onClick={handleImportClick}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition shadow-sm"
                    >
                        <Upload className="w-4 h-4" />
                        Import JSON
                    </button>
                    <button
                        onClick={handlePaste}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition shadow-sm"
                    >
                        <Clipboard className="w-4 h-4" />
                        Paste from Clipboard
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={!isValid}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download className="w-4 h-4" />
                        Export JSON
                    </button>
                </div>

                {/* Editor Area */}
                <div className="flex-grow p-0 overflow-hidden flex flex-col relative group">
                    <textarea
                        value={jsonContent}
                        onChange={(e) => handleTextChange(e.target.value)}
                        className={`w-full h-full p-5 font-mono text-sm leading-relaxed resize-none focus:outline-none transition-colors text-neutral-900
                            ${error ? 'bg-red-50/30' : 'bg-white'}
                        `}
                        placeholder='[ { "type": "standard", "question": "...", "answer": "..." } ]'
                        spellCheck={false}
                    />

                    {/* Floating Valid Indicator if valid */}
                    {isValid && !error && (
                        <div className="absolute bottom-4 right-6 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Valid JSON
                        </div>
                    )}
                </div>

                {/* Error / Status Bar */}
                {error && (
                    <div className="bg-red-50 border-t border-red-100 p-3 flex items-start gap-3 animate-in slide-in-from-bottom-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-700 font-medium">
                            {error}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 border-t bg-white flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-neutral-600 hover:text-neutral-900 font-medium transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid || isSaving}
                        className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-bold text-white transition shadow-md hover:shadow-lg transform active:scale-95 ${!isValid || isSaving
                            ? 'bg-neutral-400 cursor-not-allowed shadow-none'
                            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                            }`}
                    >
                        {isSaving ? 'Saving...' : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
