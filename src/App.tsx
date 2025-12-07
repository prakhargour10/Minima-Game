
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Card, Player, GameState, GamePhase, TurnPhase, ActionPayload
} from './types';
import { 
  createDeck, shuffle, calculateHandValue, isValidDiscard 
} from './utils/cardUtils';
import PlayerArea from './components/PlayerArea';
import CardComponent from './components/CardComponent';
import { network } from './services/networkService';

// Constants
const STARTING_HAND_SIZE = 5;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

const App: React.FC = () => {
  // --- Local UI State ---
  const [playerName, setPlayerName] = useState<string>('');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // --- Game State (Synced) ---
  const [gameState, setGameState] = useState<GameState>({
    phase: GamePhase.SETUP,
    players: [],
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    turnPhase: TurnPhase.START,
    winnerId: null,
    roundLog: [],
    cardsPlayedThisTurn: 0,
    roomId: '',
    hostId: 0
  });

  const [selectedHandIndices, setSelectedHandIndices] = useState<number[]>([]);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.roundLog]);

  // Clear selection when turn changes or phase changes
  useEffect(() => {
    if (gameState.currentPlayerIndex !== myPlayerId || gameState.turnPhase !== TurnPhase.START) {
      setSelectedHandIndices([]);
    }
  }, [gameState.currentPlayerIndex, gameState.turnPhase, myPlayerId]);

  // --- Networking Setup ---

  useEffect(() => {
    // Listener for GAME_UPDATE (For Clients & Host self-updates via broadcast loopback usually handled differently, 
    // but here we just update state locally for host and network for others)
    
    const gameUpdateHandler = (newGameState: GameState) => {
      // If I am a client, I accept the new state
      if (!isHost) {
        setGameState(newGameState);
        if (newGameState.phase === GamePhase.ROUND_OVER) setShowWinnerModal(true);
        if (newGameState.phase === GamePhase.PLAYING && newGameState.roundLog.length === 1) setShowWinnerModal(false);
      }
    };

    const joinRequestHandler = (payload: { name: string, tempId: string }) => {
      if (!isHost) return;
      
      // Host logic: Add player if room not full
      setGameState(prev => {
        if (prev.players.length >= MAX_PLAYERS) return prev;
        if (prev.phase !== GamePhase.LOBBY) return prev;

        const newId = prev.players.length;
        const newPlayer: Player = {
          id: newId,
          name: payload.name,
          isBot: false,
          hand: [],
          score: 0
        };

        const newState = {
          ...prev,
          players: [...prev.players, newPlayer]
        };

        // Broadcast new state so the new player (and others) see it
        // We also need to tell the specific connecting user their ID, 
        // but broadly broadcasting the state allows them to find themselves by name for now 
        // or we send a specific ACK.
        
        network.send('JOIN_ACK', { name: payload.name, assignedId: newId });
        network.send('GAME_UPDATE', newState);
        return newState;
      });
    };

    const playerActionHandler = (payload: ActionPayload) => {
      if (!isHost) return;
      
      // Host validates and executes action - use callback to get fresh state
      setGameState(currentState => {
        if (payload.actionType === 'DISCARD') {
          const currentPlayer = currentState.players[currentState.currentPlayerIndex];
          if (currentPlayer.id !== payload.playerId) return currentState;

          const indices = Array.isArray(payload.data) ? payload.data : [];
          const cardsToDiscard = indices.map((i: number) => currentPlayer.hand[i]).filter((card: Card | undefined) => card !== undefined);
          
          if (cardsToDiscard.length === 0 || !isValidDiscard(cardsToDiscard)) return currentState;

          const newHand = currentPlayer.hand.filter((_: Card, i: number) => !indices.includes(i));
          const newDiscardPile = [...currentState.discardPile, ...cardsToDiscard];

          const newState = {
            ...currentState,
            discardPile: newDiscardPile,
            players: currentState.players.map(p => p.id === payload.playerId ? { ...p, hand: newHand, lastAction: 'Discarded' } : p),
            turnPhase: TurnPhase.DRAW,
            cardsPlayedThisTurn: cardsToDiscard.length
          };
          
          network.send('GAME_UPDATE', newState);
          return newState;
        }

        if (payload.actionType === 'DRAW') {
          const currentPlayer = currentState.players[currentState.currentPlayerIndex];
          if (currentPlayer.id !== payload.playerId) return currentState;

          let newDeck = [...currentState.deck];
          let newDiscardPile = [...currentState.discardPile];
          let drawnCard: Card | undefined;
          const numPlayed = currentState.cardsPlayedThisTurn || 0;

          if (payload.data.fromDiscard) {
            const targetIndex = newDiscardPile.length - 1 - numPlayed;
            if (targetIndex >= 0) {
              drawnCard = newDiscardPile[targetIndex];
              newDiscardPile.splice(targetIndex, 1);
            }
          } else {
            if (newDeck.length === 0 && newDiscardPile.length > 1) {
              const keptCount = numPlayed > 0 ? numPlayed : 1;
              const cardsToKeep = newDiscardPile.slice(-keptCount);
              const cardsToShuffle = newDiscardPile.slice(0, -keptCount);
              newDeck = shuffle(cardsToShuffle);
              newDiscardPile = cardsToKeep;
            }
            drawnCard = newDeck.pop();
          }

          if (!drawnCard) return currentState;

          const updatedPlayers = currentState.players.map(p =>
            p.id === payload.playerId
              ? { ...p, hand: [...p.hand, drawnCard!], lastAction: payload.data.fromDiscard ? 'Swapped' : 'Drew Card' }
              : p
          );

          const newState = {
            ...currentState,
            deck: newDeck,
            discardPile: newDiscardPile,
            players: updatedPlayers,
            turnPhase: TurnPhase.START
          };

          network.send('GAME_UPDATE', newState);
          setTimeout(() => {
            const nextIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
            const nextTurnState = {
              ...newState,
              currentPlayerIndex: nextIndex,
              turnPhase: TurnPhase.START,
              cardsPlayedThisTurn: 0,
              players: newState.players.map(p => ({ ...p, lastAction: undefined }))
            };
            setGameState(nextTurnState);
            network.send('GAME_UPDATE', nextTurnState);
          }, 1000);
          
          return newState;
        }

        if (payload.actionType === 'SHOW') {
          const currentPlayer = currentState.players.find(p => p.id === payload.playerId);
          if (!currentPlayer) return currentState;

          let log = [...currentState.roundLog, `${currentPlayer.name} called SHOW!`];
          
          const callerSum = calculateHandValue(currentPlayer.hand);
          let minSum = callerSum;
          let strictlyLowest = true;

          currentState.players.forEach(p => {
            if (p.id === currentPlayer.id) return;
            const pSum = calculateHandValue(p.hand);
            if (pSum <= callerSum) {
              strictlyLowest = false;
              minSum = Math.min(minSum, pSum);
            }
          });

          let winnerId = -1;
          if (strictlyLowest) {
            log.push(`${currentPlayer.name} has the lowest hand (${callerSum})! They WIN!`);
            winnerId = currentPlayer.id;
          } else {
            log.push(`${currentPlayer.name} (${callerSum}) was caught! Someone has equal or lower.`);
            let bestSum = 9999;
            currentState.players.forEach(p => {
              const s = calculateHandValue(p.hand);
              if (s < bestSum) {
                bestSum = s;
                winnerId = p.id;
              }
            });
          }

          const newState = {
            ...currentState,
            phase: GamePhase.ROUND_OVER,
            winnerId,
            roundLog: log
          };
          
          setShowWinnerModal(true);
          network.send('GAME_UPDATE', newState);
          return newState;
        }

        return currentState;
      });
    };

    const joinAckHandler = (payload: { name: string, assignedId: number }) => {
      // If this is for me
      if (payload.name === playerName && myPlayerId === null) {
        setMyPlayerId(payload.assignedId);
      }
    };

    network.on('GAME_UPDATE', gameUpdateHandler);
    network.on('JOIN_REQUEST', joinRequestHandler);
    network.on('PLAYER_ACTION', playerActionHandler);
    network.on('JOIN_ACK', joinAckHandler);

    return () => {
      // Only remove listeners, don't disconnect
      network.off('GAME_UPDATE', gameUpdateHandler);
      network.off('JOIN_REQUEST', joinRequestHandler);
      network.off('PLAYER_ACTION', playerActionHandler);
      network.off('JOIN_ACK', joinAckHandler);
    };
  }, [isHost, playerName, myPlayerId]);


  // --- HOST Logic Methods (Updates State & Broadcasts) ---

  const broadcastState = (newState: GameState) => {
    setGameState(newState);
    network.send('GAME_UPDATE', newState);
  };

  const nextTurn = useCallback((currentState: GameState) => {
    const nextIndex = (currentState.currentPlayerIndex + 1) % currentState.players.length;
    const newState = {
      ...currentState,
      currentPlayerIndex: nextIndex,
      turnPhase: TurnPhase.START,
      cardsPlayedThisTurn: 0,
      players: currentState.players.map(p => ({ ...p, lastAction: undefined }))
    };
    broadcastState(newState);
  }, []);

  const startGameHost = () => {
    if (gameState.players.length < MIN_PLAYERS) {
      setErrorMsg(`Need at least ${MIN_PLAYERS} players.`);
      return;
    }

    const deck = createDeck(gameState.players.length > 5 ? 2 : 1);
    const playersWithCards = gameState.players.map(p => ({ ...p, hand: [] as Card[], score: 0 }));

    // Deal cards
    for (let i = 0; i < STARTING_HAND_SIZE; i++) {
      playersWithCards.forEach(p => {
        if (deck.length > 0) p.hand.push(deck.pop()!);
      });
    }

    const startCard = deck.pop();
    const discardPile = startCard ? [startCard] : [];

    const newState: GameState = {
      ...gameState,
      phase: GamePhase.PLAYING,
      players: playersWithCards,
      deck,
      discardPile,
      currentPlayerIndex: 0, 
      turnPhase: TurnPhase.START,
      winnerId: null,
      roundLog: ['Game Started!'],
      cardsPlayedThisTurn: 0
    };

    setShowWinnerModal(false);
    broadcastState(newState);
  };

  const handleHostShow = (playerId: number) => {
    const currentPlayer = gameState.players.find(p => p.id === playerId);
    if (!currentPlayer) return;

    let log = [...gameState.roundLog, `${currentPlayer.name} called SHOW!`];
    
    const callerSum = calculateHandValue(currentPlayer.hand);
    let minSum = callerSum;
    let strictlyLowest = true;

    gameState.players.forEach(p => {
      if (p.id === currentPlayer.id) return;
      const pSum = calculateHandValue(p.hand);
      if (pSum <= callerSum) {
        strictlyLowest = false;
        minSum = Math.min(minSum, pSum);
      }
    });

    let winnerId = -1;
    if (strictlyLowest) {
      log.push(`${currentPlayer.name} has the lowest hand (${callerSum})! They WIN!`);
      winnerId = currentPlayer.id;
    } else {
      log.push(`${currentPlayer.name} (${callerSum}) was caught! Someone has equal or lower.`);
      let bestSum = 9999;
      gameState.players.forEach(p => {
        const s = calculateHandValue(p.hand);
        if (s < bestSum) {
          bestSum = s;
          winnerId = p.id;
        } else if (s === bestSum && winnerId === currentPlayer.id) {
          winnerId = p.id;
        }
      });
    }

    broadcastState({
      ...gameState,
      phase: GamePhase.ROUND_OVER,
      winnerId,
      roundLog: log
    });
  };

  const handleHostDiscard = (playerId: number, indices: number[]) => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    // Validation
    if (currentPlayer.id !== playerId) return; 

    const cardsToDiscard = indices.map(i => currentPlayer.hand[i]);
    if (!isValidDiscard(cardsToDiscard)) return;

    const newHand = currentPlayer.hand.filter((_, i) => !indices.includes(i));
    const newDiscardPile = [...gameState.discardPile, ...cardsToDiscard];

    const newState = {
      ...gameState,
      discardPile: newDiscardPile,
      players: gameState.players.map(p => p.id === playerId ? { ...p, hand: newHand, lastAction: 'Discarded' } : p),
      turnPhase: TurnPhase.DRAW,
      cardsPlayedThisTurn: cardsToDiscard.length
    };
    
    broadcastState(newState);
  };

  const handleHostDraw = (playerId: number, fromDiscard: boolean) => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;

    let newDeck = [...gameState.deck];
    let newDiscardPile = [...gameState.discardPile];
    let drawnCard: Card | undefined;
    const numPlayed = gameState.cardsPlayedThisTurn || 0;

    if (fromDiscard) {
      const targetIndex = newDiscardPile.length - 1 - numPlayed;
      if (targetIndex >= 0) {
        drawnCard = newDiscardPile[targetIndex];
        newDiscardPile.splice(targetIndex, 1);
      }
    } else {
      if (newDeck.length === 0) {
        if (newDiscardPile.length > 1) {
             const keptCount = numPlayed > 0 ? numPlayed : 1; 
             const cardsToKeep = newDiscardPile.slice(-keptCount);
             const cardsToShuffle = newDiscardPile.slice(0, -keptCount);
             newDeck = shuffle(cardsToShuffle);
             newDiscardPile = cardsToKeep;
        } else {
             // No cards logic
        }
      }
      drawnCard = newDeck.pop();
    }

    if (!drawnCard) return;

    const updatedPlayers = gameState.players.map(p => 
      p.id === playerId
        ? { ...p, hand: [...p.hand, drawnCard!], lastAction: fromDiscard ? 'Swapped' : 'Drew Card' } 
        : p
    );

    const newState = {
      ...gameState,
      deck: newDeck,
      discardPile: newDiscardPile,
      players: updatedPlayers,
      turnPhase: TurnPhase.START 
    };

    broadcastState(newState);
    setTimeout(() => nextTurn(newState), 1000);
  };

  // --- Client Actions (Send to Host) ---

  const sendAction = (actionType: 'DISCARD' | 'DRAW' | 'SHOW', data?: any) => {
    if (isHost) {
      // Execute directly
      if (myPlayerId === null) return;
      if (actionType === 'DISCARD') handleHostDiscard(myPlayerId, data);
      if (actionType === 'DRAW') handleHostDraw(myPlayerId, data.fromDiscard);
      if (actionType === 'SHOW') handleHostShow(myPlayerId);
    } else {
      // Send to Host
      if (myPlayerId === null) return;
      network.send('PLAYER_ACTION', {
        actionType,
        playerId: myPlayerId,
        data
      });
      setSelectedHandIndices([]); // Optimistic clear
    }
  };

  // --- UI Handlers ---

  const handleCreateRoom = () => {
    if (!playerName) { setErrorMsg("Enter name"); return; }
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    setIsHost(true);
    setMyPlayerId(0); // Host is always 0
    network.connect(roomId);
    
    const hostPlayer: Player = {
      id: 0,
      name: playerName,
      isBot: false,
      hand: [],
      score: 0
    };

    setGameState({
      ...gameState,
      roomId,
      phase: GamePhase.LOBBY,
      hostId: 0,
      players: [hostPlayer]
    });
  };

  const handleJoinRoom = () => {
    if (!playerName) { setErrorMsg("Enter name"); return; }
    if (!inputRoomId) { setErrorMsg("Enter Room ID"); return; }
    
    setIsHost(false);
    network.connect(inputRoomId);
    
    // Request Join
    // We need a slight delay to ensure connection is ready, though BroadcastChannel is instant
    setTimeout(() => {
      network.send('JOIN_REQUEST', { name: playerName, tempId: Date.now().toString() });
    }, 100);

    setGameState(prev => ({ ...prev, phase: GamePhase.LOBBY, roomId: inputRoomId }));
  };

  const handleCardClick = (index: number) => {
    if (gameState.currentPlayerIndex !== myPlayerId) return;
    if (gameState.turnPhase !== TurnPhase.START) return;
    
    setSelectedHandIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  // --- Computed Values ---
  
  const isMyTurn = gameState.currentPlayerIndex === myPlayerId && gameState.phase === GamePhase.PLAYING;
  const topCard = gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;
  const numPlayed = gameState.cardsPlayedThisTurn || 0;
  const previousTopIndex = gameState.discardPile.length - 1 - numPlayed;
  const previousTopCard = (isMyTurn && gameState.turnPhase === TurnPhase.DRAW && previousTopIndex >= 0) 
      ? gameState.discardPile[previousTopIndex] 
      : null;

  // Safe card selection validation
  const myHand = myPlayerId !== null ? gameState.players[myPlayerId]?.hand || [] : [];
  const selectedCards = selectedHandIndices
    .filter(i => i >= 0 && i < myHand.length)
    .map(i => myHand[i])
    .filter(card => card !== undefined);
  const isValidSelection = selectedCards.length > 0 && isValidDiscard(selectedCards);

  // Render Helpers
  const getPosition = (index: number, total: number) => {
    if (myPlayerId === null) return 'top';
    
    // Normalize indices so My Player is 0 (relative)
    const relativeIndex = (index - myPlayerId + total) % total;
    
    if (relativeIndex === 0) return 'bottom';
    
    if (total === 3) {
      if (relativeIndex === 1) return 'left';
      return 'right';
    }
    if (total === 4) {
      if (relativeIndex === 1) return 'left';
      if (relativeIndex === 2) return 'top';
      return 'right';
    }
    if (total === 5) {
      if (relativeIndex === 1) return 'left';
      if (relativeIndex === 2) return 'top';
      if (relativeIndex === 3) return 'top'; 
      return 'right';
    }
    return 'top';
  };

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col items-center relative overflow-hidden font-sans touch-none">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900 to-slate-900 pointer-events-none"></div>

      {/* SETUP PHASE (Entry) */}
      {gameState.phase === GamePhase.SETUP && (
        <div className="z-10 flex flex-col items-center justify-center h-full space-y-4 sm:space-y-8 animate-fade-in w-full max-w-md px-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-tighter">
            MINIMA
          </h1>
          <div className="bg-slate-800/80 p-4 sm:p-8 rounded-2xl shadow-2xl backdrop-blur border border-slate-700 w-full text-center">
            <h2 className="text-xl sm:text-2xl mb-4 sm:mb-6 font-semibold">Welcome</h2>
            
            <input 
              type="text" 
              placeholder="Your Name" 
              className="w-full bg-slate-900 border border-slate-600 rounded p-2 sm:p-3 mb-4 text-center focus:border-green-400 outline-none text-base"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <button onClick={handleCreateRoom} className="py-2 sm:py-3 bg-blue-600 rounded-lg font-bold hover:bg-blue-500 transition-colors text-sm sm:text-base active:scale-95">
                Create Room
              </button>
              <div className="flex flex-col gap-1 sm:gap-2">
                 <input 
                    type="text" 
                    placeholder="Room ID" 
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 sm:p-3 text-center text-sm"
                    value={inputRoomId}
                    onChange={(e) => setInputRoomId(e.target.value)}
                  />
                 <button onClick={handleJoinRoom} className="py-2 bg-slate-600 rounded-lg font-bold hover:bg-slate-500 transition-colors text-sm active:scale-95">
                   Join
                 </button>
              </div>
            </div>
            {errorMsg && <div className="text-red-400 text-sm mt-4">{errorMsg}</div>}
          </div>
          <p className="text-xs text-slate-500 text-center">Open multiple tabs to simulate multiplayer.</p>
        </div>
      )}

      {/* LOBBY PHASE */}
      {gameState.phase === GamePhase.LOBBY && (
        <div className="z-10 flex flex-col items-center justify-center h-full space-y-4 sm:space-y-6 animate-fade-in px-4">
          <h2 className="text-3xl sm:text-4xl font-bold">Lobby</h2>
          <div className="bg-slate-800/90 p-4 sm:p-8 rounded-xl border border-slate-600 min-w-[280px] sm:min-w-[300px] w-full max-w-md text-center">
             <div className="mb-4 sm:mb-6">
                <div className="text-slate-400 text-xs sm:text-sm">Room ID</div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-yellow-400 tracking-widest break-all">{gameState.roomId}</div>
             </div>

             <div className="space-y-2 mb-6 sm:mb-8">
               <div className="text-sm font-bold border-b border-slate-600 pb-2 mb-2">Players ({gameState.players.length}/{MAX_PLAYERS})</div>
               {gameState.players.map((p) => (
                 <div key={p.id} className="flex items-center justify-between bg-slate-700 p-2 rounded text-sm sm:text-base">
                    <span className="truncate flex-1 text-left">{p.name}</span>
                    {p.id === gameState.hostId && <span className="text-xs text-yellow-500 ml-2">HOST</span>}
                 </div>
               ))}
               {gameState.players.length === 0 && <div className="text-slate-500 italic text-sm">Connecting...</div>}
             </div>

             {isHost ? (
               <button 
                 onClick={startGameHost}
                 disabled={gameState.players.length < MIN_PLAYERS}
                 className="w-full py-2 sm:py-3 bg-green-600 rounded-lg font-bold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base active:scale-95"
               >
                 Start Game
               </button>
             ) : (
               <div className="text-slate-400 animate-pulse text-sm sm:text-base">Waiting for host to start...</div>
             )}
          </div>
        </div>
      )}

      {/* GAMEPLAY PHASE */}
      {(gameState.phase === GamePhase.PLAYING || gameState.phase === GamePhase.ROUND_OVER) && (
        <>
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 h-14 sm:h-16 bg-slate-900/50 backdrop-blur flex items-center justify-between px-3 sm:px-6 z-20 border-b border-white/5">
             <div className="flex flex-col">
                <span className="font-bold text-green-400 tracking-widest text-sm sm:text-base">MINIMA</span>
                <span className="text-[9px] sm:text-[10px] text-slate-500">Room: {gameState.roomId}</span>
             </div>
             <div className="text-xs sm:text-sm font-semibold">
                {gameState.players[gameState.currentPlayerIndex]?.id === myPlayerId ? (
                   <span className="text-yellow-400 animate-pulse">YOUR TURN</span>
                ) : (
                   <>
                     <span className="text-slate-400 hidden sm:inline">Current Turn: {gameState.players[gameState.currentPlayerIndex]?.name}</span>
                     <span className="text-slate-400 sm:hidden truncate max-w-[100px]">{gameState.players[gameState.currentPlayerIndex]?.name}</span>
                   </>
                )}
             </div>
             <button onClick={() => window.location.reload()} className="text-xs bg-red-900/50 text-red-300 px-3 py-1 rounded hover:bg-red-900">Leave</button>
          </div>

          {/* Players */}
          {gameState.players.map((p) => (
             <PlayerArea 
               key={p.id}
               player={p}
               isCurrentUser={p.id === myPlayerId}
               isActive={gameState.currentPlayerIndex === p.id && gameState.phase === GamePhase.PLAYING}
               selectedIndices={p.id === myPlayerId ? selectedHandIndices : []}
               onCardClick={handleCardClick}
               position={getPosition(p.id, gameState.players.length) as any}
               roundOver={gameState.phase === GamePhase.ROUND_OVER}
             />
          ))}

          {/* Center Table */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 sm:gap-8 items-center z-0 scale-75 sm:scale-100">
             
             {/* Deck */}
             <div className="relative group">
               <div className="w-20 h-28 sm:w-24 sm:h-36 bg-blue-900 rounded-lg border-2 border-slate-400 shadow-2xl relative">
                  <div className="absolute inset-0 m-1 border border-blue-400/30 rounded"></div>
                  <span className="absolute inset-0 flex items-center justify-center font-bold text-blue-200 opacity-20 text-3xl sm:text-4xl">?</span>
               </div>
               <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs font-bold text-slate-400 whitespace-nowrap">Deck ({gameState.deck.length})</div>
               
               {isMyTurn && gameState.turnPhase === TurnPhase.DRAW && (
                 <button 
                   onClick={() => sendAction('DRAW', { fromDiscard: false })}
                   className="absolute inset-0 bg-green-500/20 hover:bg-green-500/40 active:bg-green-500/60 cursor-pointer rounded-lg flex items-center justify-center animate-pulse border-2 border-green-400"
                 >
                   <span className="bg-slate-900/80 px-2 py-1 rounded text-[10px] sm:text-xs font-bold">Draw</span>
                 </button>
               )}
             </div>

             {/* Discard Pile */}
             <div className="relative flex items-center gap-2 sm:gap-4">
                
                {previousTopCard && (
                  <div className="relative animate-slide-in-right">
                     <div className="opacity-80 hover:opacity-100 transition-opacity">
                        <CardComponent card={previousTopCard} />
                     </div>
                     <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs font-bold text-yellow-500 whitespace-nowrap">Previous Top</div>
                     <button 
                        onClick={() => sendAction('DRAW', { fromDiscard: true })}
                        className="absolute inset-0 bg-yellow-500/20 hover:bg-yellow-500/40 active:bg-yellow-500/60 cursor-pointer rounded-lg flex items-center justify-center animate-pulse border-2 border-yellow-400"
                      >
                        <span className="bg-slate-900/80 px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-xs font-bold">Take This</span>
                      </button>
                  </div>
                )}

                <div className="relative">
                  {topCard ? (
                    <CardComponent card={topCard} />
                  ) : (
                    <div className="w-20 h-28 sm:w-24 sm:h-36 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-600 text-xs">Empty</div>
                  )}
                   <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs font-bold text-slate-400">Discard</div>
                </div>
             </div>
          </div>

          {/* Controls */}
          <div className="absolute bottom-40 sm:bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 sm:gap-4 z-30 px-4">
            {isMyTurn && gameState.turnPhase === TurnPhase.START && (
              <>
                <div className="flex gap-2 sm:gap-4">
                  <button 
                      onClick={() => sendAction('SHOW')}
                      className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 rounded-full font-bold shadow-lg hover:bg-red-500 active:scale-95 transition-all border-2 border-red-400 text-sm sm:text-base"
                  >
                    SHOW ✋
                  </button>

                  <button 
                      onClick={() => sendAction('DISCARD', selectedHandIndices)}
                      disabled={!isValidSelection}
                      className="px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 rounded-full font-bold shadow-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all border-2 border-blue-400 text-sm sm:text-base"
                  >
                    PLAY SELECTED 🎴
                  </button>
                </div>
                {selectedHandIndices.length > 0 && !isValidSelection && (
                  <div className="text-red-400 text-xs sm:text-sm bg-red-900/30 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-red-500/50">
                    ⚠️ Selected cards must have the same rank
                  </div>
                )}
                {selectedHandIndices.length === 0 && (
                  <div className="text-slate-400 text-xs text-center">
                    Select cards to play or call SHOW
                  </div>
                )}
              </>
            )}
            {isMyTurn && gameState.turnPhase === TurnPhase.DRAW && (
              <div className="bg-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold animate-bounce text-yellow-400 border border-yellow-500/50 text-center">
                 Draw from Deck or Previous Pile Card
              </div>
            )}
            {!isMyTurn && (
                <div className="bg-slate-900/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs text-slate-400 border border-slate-700 text-center">
                    Waiting for {gameState.players[gameState.currentPlayerIndex]?.name}...
                </div>
            )}
          </div>
          
          {/* Game Log */}
          <div className="absolute bottom-4 right-4 w-64 h-32 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 overflow-y-auto p-2 text-xs font-mono space-y-1 shadow-lg hidden md:block">
            {gameState.roundLog.map((log, i) => (
              <div key={i} className="text-slate-300 border-b border-slate-800 pb-1">{log}</div>
            ))}
            <div ref={logEndRef}></div>
          </div>

          {/* Winner Modal */}
          {showWinnerModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl border border-yellow-500/50 shadow-2xl max-w-md w-full text-center">
                 <h2 className="text-3xl sm:text-4xl font-bold text-yellow-400 mb-2">Round Over!</h2>
                 <p className="text-lg sm:text-xl text-white mb-4 sm:mb-6">
                   {gameState.players.find(p => p.id === gameState.winnerId)?.name} Wins!
                 </p>
                 
                 <div className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
                   {gameState.players.sort((a,b) => calculateHandValue(a.hand) - calculateHandValue(b.hand)).map(p => (
                     <div key={p.id} className={`flex justify-between p-2 sm:p-3 rounded text-sm sm:text-base ${p.id === gameState.winnerId ? 'bg-green-900/50 border border-green-500' : 'bg-slate-700'}`}>
                        <span className="truncate flex-1 text-left">{p.name}</span>
                        <span className="font-bold ml-2">{calculateHandValue(p.hand)} pts</span>
                     </div>
                   ))}
                 </div>

                 {isHost ? (
                    <div className="flex gap-4 justify-center">
                        <button onClick={startGameHost} className="px-4 sm:px-6 py-2 sm:py-3 bg-green-600 rounded-lg font-bold hover:bg-green-500 active:scale-95 text-sm sm:text-base">
                        Play Again
                        </button>
                    </div>
                 ) : (
                    <div className="text-xs sm:text-sm text-slate-400">Waiting for host to start next round...</div>
                 )}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
};

export default App;
