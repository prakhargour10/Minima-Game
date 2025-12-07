import React from 'react';
import { Card, Suit } from '../types';
import { getSuitColor } from '../utils/cardUtils';

interface CardProps {
  card: Card;
  onClick?: () => void;
  selected?: boolean;
  playable?: boolean;
  hidden?: boolean;
  small?: boolean;
}

const CardComponent: React.FC<CardProps> = ({ card, onClick, selected, playable, hidden, small }) => {
  if (hidden) {
    return (
      <div 
        className={`
          ${small ? 'w-10 h-14' : 'w-20 h-28 md:w-24 md:h-36'} 
          bg-blue-800 rounded-lg border-2 border-white shadow-md
          flex items-center justify-center relative
          bg-opacity-90 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]
        `}
      >
        <div className="w-full h-full rounded-md border border-blue-600 opacity-50"></div>
      </div>
    );
  }

  const colorClass = getSuitColor(card.suit);
  const isJoker = card.suit === Suit.Joker;

  return (
    <div
      onClick={onClick}
      className={`
        ${small ? 'w-10 h-14 text-xs' : 'w-20 h-28 md:w-24 md:h-36 text-base'}
        bg-white rounded-lg shadow-lg flex flex-col justify-between p-2
        transition-all duration-200 select-none relative
        ${selected ? '-translate-y-4 ring-4 ring-yellow-400 z-10' : 'hover:-translate-y-1'}
        ${playable ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      <div className={`font-bold ${colorClass} text-left leading-none`}>
        {card.rank === '10' ? '10' : card.rank.charAt(0)}
        {!isJoker && <div className="text-[0.6em]">{card.suit}</div>}
      </div>
      
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none`}>
         <span className={`text-4xl ${colorClass}`}>
           {isJoker ? '★' : card.suit}
         </span>
      </div>

      <div className={`font-bold ${colorClass} text-right leading-none rotate-180`}>
        {card.rank === '10' ? '10' : card.rank.charAt(0)}
        {!isJoker && <div className="text-[0.6em]">{card.suit}</div>}
      </div>
    </div>
  );
};

export default CardComponent;