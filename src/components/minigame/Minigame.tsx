import React, { useState, useEffect } from "react";
import { X, Play, RotateCcw, Trophy, Zap } from "lucide-react";
import { motion } from "motion/react";
import { type Card, GameState, type GameStats } from "../../types";
import { SKILLS } from "../../constants";
import { TiltedCard } from "./TiltedCard";

export interface MinigameProps {
    onClose: () => void;
}

export const Minigame: React.FC<MinigameProps> = ({ onClose }) => {
    const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
    const [cards, setCards] = useState<Card[]>([]);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [stats, setStats] = useState<GameStats>({
        moves: 0,
        matches: 0,
        score: 0,
    });
    const [level, setLevel] = useState(1);
    const [triesLeft, setTriesLeft] = useState(3);
    const [showMismatch, setShowMismatch] = useState(false);
    const [showLevelComplete, setShowLevelComplete] = useState(false);

    // Initialize cards when level changes during gameplay
    useEffect(() => {
        if (gameState === GameState.PLAYING && level > 1) {
            initializeCards();
        }
    }, [level]);

    // Shuffle array using Fisher-Yates algorithm
    const shuffleArray = <T,>(array: T[]): T[] => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    };

    const initializeCards = () => {
        // Level 1: 4 pairs (8 cards), Level 2: 8 pairs (16 cards), Level 3: 12 pairs (24 cards)
        const pairsPerLevel = [4, 8, 12];
        const techCount = pairsPerLevel[level - 1] || 4;

        // Shuffle all technologies and pick the first N
        const shuffledTechs = shuffleArray(SKILLS);
        const selectedTechs = shuffledTechs.slice(0, techCount);
        const cardPairs = [...selectedTechs, ...selectedTechs];

        const shuffled = shuffleArray(cardPairs).map((item, index) => ({
            id: `${item.name}-${index}`,
            tech: item.name,
            icon: item.svg,
            colors: `from-[${item.color}] to-[${item.color}]`,
            name: item.name,
            color: item.color,
            isFlipped: false,
            isMatched: false,
        }));

        setCards(shuffled);
        setSelectedCards([]);
        // More tries for higher levels: Level 1 = 5, Level 2 = 8, Level 3 = 12
        setTriesLeft(5 + (level - 1) * 3 + Math.floor(level / 2));
    };

    const startGame = () => {
        setGameState(GameState.PLAYING);
        setStats({ moves: 0, matches: 0, score: 0 });
        setLevel(1);
        initializeCards();
    };

    const handleCardClick = (cardId: string) => {
        if (gameState !== GameState.PLAYING) return;
        if (triesLeft <= 0) return;

        const card = cards.find((c) => c.id === cardId);
        if (!card || card.isFlipped || card.isMatched) return;
        if (selectedCards.length >= 2) return;

        const newCards = cards.map((c) =>
            c.id === cardId ? { ...c, isFlipped: true } : c,
        );
        setCards(newCards);

        const newSelected = [...selectedCards, cardId];
        setSelectedCards(newSelected);

        if (newSelected.length === 2) {
            setStats((prev) => ({ ...prev, moves: prev.moves + 1 }));
            checkForMatch(newSelected, newCards);
        }
    };

    const checkForMatch = (selected: string[], currentCards: Card[]) => {
        const [first, second] = selected.map((id) =>
            currentCards.find((c) => c.id === id),
        );

        if (first && second && first.tech === second.tech) {
            setTimeout(() => {
                setCards((prev) =>
                    prev.map((c) =>
                        c.id === first.id || c.id === second.id
                            ? { ...c, isMatched: true }
                            : c,
                    ),
                );

                setStats((prev) => ({
                    ...prev,
                    matches: prev.matches + 1,
                    score: prev.score + 100 * level,
                }));

                setSelectedCards([]);

                // Check if level is complete
                const updatedCards = cards.map((c) =>
                    c.id === first.id || c.id === second.id
                        ? { ...c, isMatched: true }
                        : c,
                );

                if (updatedCards.every((c) => c.isMatched)) {
                    setTimeout(() => {
                        if (level < 3) {
                            setShowLevelComplete(true);
                            setTimeout(() => {
                                setShowLevelComplete(false);
                                setLevel((prev) => prev + 1);
                            }, 2000);
                        } else {
                            setGameState(GameState.WIN);
                        }
                    }, 800);
                }
            }, 600);
        } else {
            setShowMismatch(true);
            setTriesLeft((prev) => prev - 1);

            setTimeout(() => {
                setCards((prev) =>
                    prev.map((c) =>
                        selected.includes(c.id)
                            ? { ...c, isFlipped: false }
                            : c,
                    ),
                );
                setSelectedCards([]);
                setShowMismatch(false);

                if (triesLeft <= 1) {
                    setGameState(GameState.GAME_OVER);
                }
            }, 1000);
        }
    };

    const resetLevel = () => {
        setStats((prev) => ({ ...prev, moves: 0, matches: 0, score: 0 }));
        setLevel(1);
        initializeCards();
        setGameState(GameState.PLAYING);
    };

    const getGridConfig = () => {
        const totalCards = cards.length;
        if (totalCards <= 8) {
            // Level 1: 8 cards - 4 columns, 2 rows
            return { cols: "grid-cols-4", gap: "gap-3", cardSize: "" };
        } else if (totalCards <= 16) {
            // Level 2: 16 cards - 8 columns, 2 rows (or 4 columns on mobile)
            return {
                cols: "grid-cols-4 md:grid-cols-8",
                gap: "gap-2 md:gap-3",
                cardSize: "",
            };
        } else {
            // Level 3: 24 cards - 6 columns, 4 rows
            return {
                cols: "grid-cols-4 md:grid-cols-6 lg:grid-cols-8",
                gap: "gap-2",
                cardSize: "",
            };
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-auto">
            {/* Game Over/Start/Win Screens */}
            {gameState !== GameState.PLAYING && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="bg-zinc-900 border border-cyan-500 p-8 rounded-lg shadow-2xl text-center max-w-md w-full">
                        {gameState === GameState.IDLE && (
                            <>
                                <Trophy className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
                                <h2 className="text-3xl font-bold text-cyan-400 mb-4 tracking-tighter">
                                    TECH MATCH
                                </h2>
                                <p className="text-zinc-400 mb-6">
                                    Match the technology pairs! Complete all 3
                                    levels with limited tries.
                                </p>
                                <div className="text-sm text-zinc-500 mb-6 space-y-1">
                                    <p>Level 1: 4 pairs (8 cards)</p>
                                    <p>Level 2: 8 pairs (16 cards)</p>
                                    <p>Level 3: 12 pairs (24 cards)</p>
                                </div>
                            </>
                        )}

                        {gameState === GameState.GAME_OVER && (
                            <>
                                <div className="text-6xl mb-4">😢</div>
                                <h2 className="text-3xl font-bold text-red-400 mb-4">
                                    GAME OVER
                                </h2>
                                <p className="text-zinc-400 mb-6">
                                    You ran out of tries!
                                </p>
                                <div className="text-2xl font-mono text-white mb-6">
                                    Final Score: {stats.score}
                                </div>
                                <div className="text-sm text-zinc-500 mb-6">
                                    Level: {level} | Matches: {stats.matches}/
                                    {Math.min(4 + level - 1, SKILLS.length)}
                                </div>
                            </>
                        )}

                        {gameState === GameState.WIN && (
                            <>
                                <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                                <h2 className="text-3xl font-bold text-yellow-400 mb-4">
                                    YOU WIN!
                                </h2>
                                <p className="text-zinc-400 mb-6">
                                    All levels completed!
                                </p>
                                <div className="text-3xl font-mono text-white mb-6">
                                    Final Score: {stats.score}
                                </div>
                                <div className="text-sm text-zinc-500 mb-6">
                                    Total Moves: {stats.moves} | Total Matches:{" "}
                                    {stats.matches}
                                </div>
                            </>
                        )}

                        <div className="flex gap-4 justify-center">
                            {(gameState === GameState.GAME_OVER ||
                                gameState === GameState.WIN) && (
                                <button
                                    onClick={resetLevel}
                                    className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-bold transition-all interactive"
                                >
                                    <RotateCcw size={20} />
                                    PLAY AGAIN
                                </button>
                            )}

                            {gameState === GameState.IDLE && (
                                <button
                                    onClick={startGame}
                                    className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-bold transition-all interactive"
                                >
                                    <Play size={20} />
                                    START GAME
                                </button>
                            )}

                            <button
                                onClick={onClose}
                                className="flex items-center gap-2 px-6 py-3 border border-zinc-600 hover:bg-zinc-800 text-zinc-300 rounded-full font-bold transition-all interactive"
                            >
                                <X size={20} />
                                EXIT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Game Board */}
            {gameState === GameState.PLAYING && (
                <div className="w-full max-w-4xl">
                    {/* Game Stats */}
                    <div className="bg-zinc-900 border border-cyan-500 p-4 rounded-lg mb-6">
                        <div className="flex justify-between items-center text-white">
                            <div className="flex gap-6">
                                <div>
                                    <span className="text-zinc-400 text-sm">
                                        Level
                                    </span>
                                    <div className="text-2xl font-bold text-cyan-400">
                                        {level}/3
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-400 text-sm">
                                        Score
                                    </span>
                                    <div className="text-2xl font-bold">
                                        {stats.score}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-400 text-sm">
                                        Matches
                                    </span>
                                    <div className="text-2xl font-bold">
                                        {stats.matches}/
                                        {[4, 8, 12][level - 1] || 4}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 items-center">
                                <div className="text-right">
                                    <span className="text-zinc-400 text-sm">
                                        Tries Left
                                    </span>
                                    <div
                                        className={`text-2xl font-bold ${triesLeft <= 1 ? "text-red-400" : "text-green-400"}`}
                                    >
                                        {triesLeft}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setGameState(GameState.IDLE)}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Cards Grid */}
                    <div
                        className={`grid ${getGridConfig().cols} ${getGridConfig().gap}`}
                    >
                        {cards.map((card) => (
                            <TiltedCard key={card.id}>
                                <button
                                    onClick={() => handleCardClick(card.id)}
                                    disabled={card.isFlipped || card.isMatched}
                                    className={`
                    aspect-square rounded-lg font-bold text-2xl transition-all duration-300 transform
                    ${
                        card.isFlipped || card.isMatched
                            ? `bg-gradient-to-br ${card.colors} rotate-0 scale-100`
                            : "bg-gradient-to-br from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 hover:scale-105"
                    }
                    ${card.isMatched ? "opacity-60 scale-95" : ""}
                    ${showMismatch && !card.isMatched && card.isFlipped ? "animate-pulse border-2 border-red-500" : ""}
                    ${!card.isFlipped && !card.isMatched && triesLeft <= 1 ? "animate-pulse border-2 border-red-500/50" : ""}
                    disabled:cursor-not-allowed interactive w-full h-full
                  `}
                                >
                                    {card.isFlipped || card.isMatched ? (
                                        <div className="flex flex-col items-center justify-center h-full text-white">
                                            <div
                                                className="w-10 h-10 mb-2 [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                                                dangerouslySetInnerHTML={{
                                                    __html: card.icon,
                                                }}
                                            />
                                            <div className="text-xs">
                                                {card.tech}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-cyan-400">
                                            <Zap className="w-8 h-8" />
                                        </div>
                                    )}
                                </button>
                            </TiltedCard>
                        ))}
                    </div>

                    {/* Level Complete Animation Overlay */}
                    {showLevelComplete && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 200,
                                    damping: 15,
                                }}
                                className="bg-gradient-to-br from-cyan-500 to-blue-600 px-12 py-8 rounded-2xl shadow-2xl border-4 border-white/20"
                            >
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-center"
                                >
                                    <div className="text-6xl mb-4">🎉</div>
                                    <h3 className="text-3xl font-black text-white mb-2 tracking-tight">
                                        LEVEL {level} COMPLETE!
                                    </h3>
                                    <p className="text-white/80 font-mono text-sm">
                                        Get ready for Level {level + 1}...
                                    </p>
                                    <div className="mt-4 flex justify-center gap-2">
                                        {[...Array(3)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{
                                                    delay: 0.3 + i * 0.1,
                                                    type: "spring",
                                                }}
                                                className="w-3 h-3 bg-white rounded-full"
                                            />
                                        ))}
                                    </div>
                                </motion.div>
                            </motion.div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Minigame;
