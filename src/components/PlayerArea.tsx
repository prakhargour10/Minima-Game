import React from 'react';
import { Player } from '../types';
import CardComponent from './CardComponent';
import { calculateHandValue } from '../utils/cardUtils';

interface PlayerAreaProps {
  player: Player;
  isCurrentUser: boolean;
  isActive: boolean;
  selectedIndices: number[];
  onCardClick: (index: number) => void;
  position: 'bottom' | 'top' | 'left' | 'right';
  roundOver?: boolean;
}

const PlayerArea: React.FC<PlayerAreaProps> = ({ 
  player, 
  isCurrentUser, 
  isActive, 
  selectedIndices, 
  onCardClick,
  position,
  roundOver
}) => {
  const isHorizontal = position === 'top' || position === 'bottom';
  const showCards = isCurrentUser || roundOver;

  // Layout classes based on position
  const containerClasses = {
    bottom: "flex-col-reverse bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2",
    top: "flex-col top-2 sm:top-4 left-1/2 -translate-x-1/2 scale-75 sm:scale-90",
    left: "flex-row top-1/2 left-2 sm:left-4 -translate-y-1/2 scale-75 sm:scale-90",
    right: "flex-row-reverse top-1/2 right-2 sm:right-4 -translate-y-1/2 scale-75 sm:scale-90",
  };

  const handContainerClasses = {
    bottom: "flex gap-1 sm:gap-2 justify-center mt-2 sm:mt-4",
    top: "flex gap-1 justify-center mb-2 scale-75",
    left: "flex flex-col gap-1 justify-center mr-2 scale-75",
    right: "flex flex-col gap-1 justify-center ml-2 scale-75",
  };

  return (
    <div className={`absolute flex items-center ${containerClasses[position]} transition-all duration-500`}>
      {/* Hand */}
      <div className={`${handContainerClasses[position]}`}>
        {player.hand.map((card, idx) => (
          <div key={card.id} className={!isHorizontal ? "my-[-20px]" : ""}>
             <CardComponent
              card={card}
              hidden={!showCards}
              selected={isCurrentUser && selectedIndices.includes(idx)}
              onClick={() => isCurrentUser && !roundOver ? onCardClick(idx) : undefined}
              playable={isCurrentUser}
              small={!isCurrentUser}
            />
          </div>
        ))}
      </div>

      {/* Info Bubble */}
      <div className={`
        relative px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl backdrop-blur-md shadow-xl border
        ${isActive ? 'bg-yellow-500/20 border-yellow-400' : 'bg-slate-800/60 border-slate-600'}
        flex flex-col items-center min-w-[100px] sm:min-w-[120px]
      `}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] sm:text-xs font-bold border border-white/20">
            {player.name.charAt(0)}
          </div>
          <span className="font-bold text-xs sm:text-sm tracking-wide truncate max-w-[80px] sm:max-w-none">{player.name}</span>
        </div>
        
        {isActive && <div className="text-[10px] sm:text-xs text-yellow-300 mt-1 font-semibold animate-pulse">Thinking...</div>}
        
        <div className="mt-1 flex gap-2 text-[10px] sm:text-xs text-gray-300">
           <span>Cards: {player.hand.length}</span>
           {showCards && <span>Sum: {calculateHandValue(player.hand)}</span>}
        </div>
        
        {player.lastAction && (
          <div className="absolute -top-6 sm:-top-8 bg-white text-slate-900 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full shadow-lg whitespace-nowrap animate-bounce">
            {player.lastAction}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerArea;