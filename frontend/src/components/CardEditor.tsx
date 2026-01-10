import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, CheckCircle } from 'lucide-react';
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

    useEffect(() => {
        if (isOpen) {
            // Prettify JSON on open
            setJsonContent(JSON.stringify(currentCards, null, 2));
            setIsValid(true);
            setError(null);
        }
    }, [isOpen, currentCards]);

    const handleValidation = (content: string) => {
        setJsonContent(content);
        try {
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed)) {
                throw new Error("Most be an array of objects.");
            }
            // Basic structural check (optional, backend does strict check)
            // But we can check if each item has a 'type'
            parsed.forEach((item, idx) => {
                if (!item.type) throw new Error(`Item at index ${idx} missing 'type'`);
                if (!['standard', 'quiz'].includes(item.type)) throw new Error(`Item at index ${idx} has invalid type '${item.type}'`);
            });

            setIsValid(true);
            setError(null);
        } catch (e: any) {
            setIsValid(false);
            setError(e.message);
        }
    };

    const handleSave = async () => {
        if (!isValid) return;

        setIsSaving(true);
        try {
            const parsedCards = JSON.parse(jsonContent);

            // Backend call
            const response = await fetch(`http://127.0.0.1:8000/slidepacks/${packId}/cards`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(parsedCards) // The backend expects the list directly as body? 
                // Wait, my backend definition was: cards: List[...]
                // In FastAPI, if body is a List, simply passing the list as JSON body works.
                // UNLESS I defined it as a field in a pydantic model.
                // Signature: def update_slidepack_cards(pack_id: int, cards: List[Union[QuizCard, StandardCard]]):
                // Yes, body should be the list.
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="text-xl font-bold text-neutral-800">Learning Objects Editor</h2>
                        <p className="text-sm text-neutral-500">Inject raw JSON for Flashcards & Quizzes</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition">
                        <X className="w-5 h-5 text-neutral-500" />
                    </button>
                </div>

                {/* Editor Area */}
                <div className="flex-grow p-4 overflow-hidden flex flex-col gap-2">
                    <div className="relative flex-grow">
                        <textarea
                            value={jsonContent}
                            onChange={(e) => handleValidation(e.target.value)}
                            className={`w-full h-full p-4 font-mono text-sm bg-neutral-50 border-2 rounded-lg resize-none focus:outline-none focus:ring-2 transition ${error ? 'border-red-300 focus:ring-red-200' : 'border-neutral-200 focus:ring-blue-200'
                                }`}
                            placeholder='[ { "type": "standard", ... } ]'
                            spellCheck={false}
                        />
                    </div>

                    {/* Status Bar */}
                    <div className="flex items-start gap-2 h-12">
                        {error ? (
                            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg w-full">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{error}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-3 py-2 rounded-lg w-full">
                                <CheckCircle className="w-4 h-4" />
                                <span>Valid JSON</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-neutral-50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-neutral-600 hover:text-neutral-800 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid || isSaving}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-white transition shadow-sm ${!isValid || isSaving
                                ? 'bg-neutral-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                            }`}
                    >
                        {isSaving ? 'Saving...' : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Objects
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
