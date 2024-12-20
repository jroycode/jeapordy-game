import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]
        ];
    }
    return array;
}

function App() {
    const [questionsData, setQuestionsData] = useState({});
    const [board, setBoard] = useState([]);
    const [usedQuestions, setUsedQuestions] = useState({});
    const [selectedQuestion, setSelectedQuestion] = useState(null);
    const [showAnswer, setShowAnswer] = useState(false);
    const [players, setPlayers] = useState([]);
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
    const [gameStarted, setGameStarted] = useState(false);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [gameOver, setGameOver] = useState(false);
    const [showChallenge, setShowChallenge] = useState(false);
    const [currentChallenge, setCurrentChallenge] = useState(null);
    const [challenges, setChallenges] = useState([]);
    const [punishments, setPunishments] = useState([]);
    const [showPunishment, setShowPunishment] = useState(false);
    const [currentPunishment, setCurrentPunishment] = useState(null);

    const [timeLeft, setTimeLeft] = useState(60); // Countdown from 60 seconds
    const [timerRunning, setTimerRunning] = useState(false);

    const timerRef = useRef(null);

    const challengeProbability = 0.2;
    const punishmentProbability = 0.1; 
    // Total special event probability = 30%.

    useEffect(() => {
        fetch('/challenges.json')
            .then(response => response.json())
            .then(data => setChallenges(data))
            .catch(error => console.error("Error fetching challenges:", error));

        fetch('/punishments.json')
            .then(response => response.json())
            .then(data => setPunishments(data))
            .catch(error => console.error("Error fetching punishments:", error));

        fetch('/questions.json')
            .then(response => response.json())
            .then(data => {
                setQuestionsData(data);
            })
            .catch(error => console.error("Error fetching questions:", error));
    }, []);

    useEffect(() => {
        if (board.length > 0) {
            const allAnswered = board.every(category =>
                category.questions.every(question => question.answered)
            );
            if (allAnswered && gameStarted) {
                setGameOver(true);
            }
        }
    }, [board, gameStarted]);

    // Records a used question so it won't be repeated
    const recordUsedQuestion = useCallback((question) => {
        const { categoryName, questionText, difficulty } = question;
        setUsedQuestions(prev => {
            const categoryUsed = prev[categoryName] || {};
            const diffUsed = categoryUsed[difficulty] || new Set();
            diffUsed.add(questionText);
            return {
                ...prev,
                [categoryName]: {
                    ...categoryUsed,
                    [difficulty]: diffUsed
                }
            };
        });
    }, []);

    // Finalizes the answer after correctness is determined or time runs out
    const finalizeAnswer = useCallback((isCorrect) => {
        if (selectedQuestion) {
            setPlayers(prevPlayers => {
                const updatedPlayers = prevPlayers.map((player, pIndex) => {
                    if (pIndex === currentPlayerIndex && isCorrect) {
                        return { ...player, score: player.score - selectedQuestion.value };
                    }
                    return player;
                });
                return updatedPlayers;
            });

            setBoard(prevBoard =>
                prevBoard.map(category => ({
                    ...category,
                    questions: category.questions.map(q =>
                        q === selectedQuestion ? { ...q, answered: true } : q
                    ),
                }))
            );

            recordUsedQuestion(selectedQuestion);

            setSelectedQuestion(null);
            setShowAnswer(false);
        }
    }, [selectedQuestion, currentPlayerIndex, recordUsedQuestion]);

    useEffect(() => {
        // Timer effect
        if (timerRunning) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        // Time expired logic inline
                        const modal = document.querySelector('.modal-content');
                        if (modal) {
                            modal.classList.add('time-up');
                        }
                        // After brief animation, finalize as incorrect
                        setTimeout(() => {
                            finalizeAnswer(false);
                        }, 1000);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [timerRunning, finalizeAnswer]);

    const handleAddPlayer = () => {
        if (newPlayerName.trim() !== '') {
            setPlayers([...players, { name: newPlayerName.trim(), score: 25 }]);
            setNewPlayerName('');
        }
    };

    const handleStartGame = () => {
        if (players.length > 0) {
            setGameStarted(true);
            setupBoard();
        } else {
            alert("Please add a player first");
        }
    };

    const handleQuestionClick = (question) => {
        if (!question.answered && !gameOver && challenges.length > 0 && punishments.length > 0) {
            const rand = Math.random();
            setSelectedQuestion(question);
            setShowAnswer(false);
            resetTimer();

            if (rand < challengeProbability) {
                // Show challenge
                const randomIndex = Math.floor(Math.random() * challenges.length);
                setCurrentChallenge(challenges[randomIndex]);
                setShowChallenge(true);
            } else if (rand < (challengeProbability + punishmentProbability)) {
                // Show punishment
                const randomIndex = Math.floor(Math.random() * punishments.length);
                setCurrentPunishment(punishments[randomIndex]);
                setShowPunishment(true);
            } else {
                // Normal question: start the timer once the modal is shown
                // We'll start it after the modals close.
                // Actually startTimer in the effect after challenge or punishment completes, or immediately here:
                // If no challenge or punishment: start now
                setTimeout(() => startTimer(), 50);
            }
        }
    };

    const handleChallengeComplete = () => {
        setShowChallenge(false);
        if (selectedQuestion) {
            setShowAnswer(false);
            startTimer();
        }
    }

    const handlePunishmentComplete = () => {
        setShowPunishment(false);
        if (selectedQuestion) {
            setShowAnswer(false);
            startTimer();
        }
    }

    const handleShowAnswer = () => {
        setShowAnswer(true);
        // Timer continues until answer chosen or time runs out
    };

    const handlePlayerSelect = (index) => {
        setCurrentPlayerIndex(index);
    };

    const handleAnswerResult = (isCorrect) => {
        if (selectedQuestion) {
            stopTimer();
            finalizeAnswer(isCorrect);
        }
    };

    const setupBoard = useCallback(() => {
        if (!questionsData || Object.keys(questionsData).length === 0) return;

        const categoryNames = Object.keys(questionsData);
        const shuffledCategories = shuffleArray(categoryNames);
        const chosenCategories = shuffledCategories.slice(0, 5);

        const newBoard = [];

        for (let category of chosenCategories) {
            const categoryQuestions = questionsData[category];
            const categoryUsed = usedQuestions[category] || {};

            const selectedQuestions = [];

            for (let difficulty = 1; difficulty <= 5; difficulty++) {
                const difficultyQuestions = categoryQuestions.filter(q => q.difficulty === difficulty);
                const usedSet = categoryUsed[difficulty] || new Set();
                const available = difficultyQuestions.filter(q => !usedSet.has(q.question));

                let chosenQuestion;
                if (available.length > 0) {
                    const randomIndex = Math.floor(Math.random() * available.length);
                    chosenQuestion = available[randomIndex];
                } else {
                    chosenQuestion = { question: "No Question Available", answer: "N/A", difficulty };
                }

                selectedQuestions.push({
                    ...chosenQuestion,
                    value: chosenQuestion.difficulty,
                    answered: false,
                    categoryName: category,
                    questionText: chosenQuestion.question
                });
            }

            newBoard.push({ name: category, questions: selectedQuestions });
        }

        setBoard(newBoard);
        setGameOver(false);
    }, [questionsData, usedQuestions]);

    const handlePlayAgain = () => {
        setPlayers(prevPlayers => prevPlayers.map(player => ({ ...player, score: 25 })));
        setupBoard();
        setGameOver(false);
    }

    const handleReset = () => {
        setPlayers([]);
        setCurrentPlayerIndex(0);
        setGameStarted(false);
        setGameOver(false);
        setUsedQuestions({});
        setBoard([]);
        setSelectedQuestion(null);
        setShowAnswer(false);
        setShowChallenge(false);
        setCurrentChallenge(null);
        setShowPunishment(false);
        setCurrentPunishment(null);
        stopTimer();
    }

    const resetTimer = () => {
        setTimeLeft(60);
        setTimerRunning(false);
    }

    const startTimer = () => {
        setTimeLeft(60);
        setTimerRunning(true);
    }

    const stopTimer = () => {
        setTimerRunning(false);
    }

    if (!gameStarted) {
        return (
            <div className="welcome-screen">
                <h1>Welcome to Jeopardy!</h1>
                <h2>Add Players:</h2>
                <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="Player Name"
                />
                <button onClick={handleAddPlayer}>Add Player</button>
                <ul>
                    {players.map((player, index) => (
                        <li key={index}>{player.name}</li>
                    ))}
                </ul>
                <button onClick={handleStartGame} disabled={players.length === 0}>Start Game</button>
            </div>
        );
    }

    return (
        <div className="app">
            <h1>Jeopardy!</h1>
            {gameOver && (
                <div className="game-over">
                    <p>Game Over! Final Score:</p>
                    {players.map((player, index) => (
                        <div key={index}>{player.name}: ${player.score}</div>
                    ))}
                    <button className="play-again-button" onClick={handlePlayAgain}>Play Again (Next Round)</button>
                    <button className="reset-button" onClick={handleReset}>Reset Game Completely</button>
                </div>
            )}
            {!gameOver && <h2>Current Player: {players[currentPlayerIndex].name}</h2>}
            {board.length > 0 && !gameOver && (
                <div className="board">
                    {board.map((category) => (
                        <div key={category.name} className="category">
                            <h2>{category.name}</h2>
                            {category.questions.map((question) => (
                                <div
                                    key={question.question}
                                    className={`question ${question.answered ? 'answered' : ''}`}
                                    onClick={() => handleQuestionClick(question)}
                                >
                                    {!question.answered ? `$${question.value}` : ""}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            {showChallenge && (
                <div className="modal challenge-modal">
                    <div className="modal-content">
                        <span className="close" onClick={handleChallengeComplete}>&times;</span>
                        <p>{currentChallenge.text}</p>
                        <button onClick={handleChallengeComplete}>Challenge Complete</button>
                    </div>
                </div>
            )}
            {showPunishment && (
                <div className="modal punishment-modal">
                    <div className="modal-content">
                        <span className="close" onClick={handlePunishmentComplete}>&times;</span>
                        <p>{currentPunishment.text}</p>
                        <button onClick={handlePunishmentComplete}>Punishment Complete</button>
                    </div>
                </div>
            )}
            {selectedQuestion && !showChallenge && !showPunishment && (
                <div className="modal question-modal">
                    <div className="modal-content">
                        <span className="close" onClick={() => { stopTimer(); setSelectedQuestion(null)}}>&times;</span>
                        <p className='question-text'>{selectedQuestion.question}</p>
                        {!showAnswer ? (
                            <button onClick={handleShowAnswer}>Show Answer</button>
                        ) : (
                            <div>
                                <p>The answer is: {selectedQuestion.answer}</p>
                                <button onClick={() => handleAnswerResult(true)}>Correct</button>
                                <button onClick={() => handleAnswerResult(false)}>Incorrect</button>
                            </div>
                        )}
                        <div className="timer-bar">
                            <div
                                className="timer-fill"
                                style={{ width: `${(timeLeft / 60) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            )}
            {!gameOver && (
                <>
                    <div className="player-select">
                        <h3>Select Player:</h3>
                        <div className="player-buttons">
                            {players.map((player, index) => (
                                <button
                                    key={index}
                                    className={index === currentPlayerIndex ? 'active-player' : ''}
                                    onClick={() => handlePlayerSelect(index)}
                                >
                                    {player.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="score">Score: ${players[currentPlayerIndex].score}</div>
                </>
            )}
        </div>
    );
}

export default App;
