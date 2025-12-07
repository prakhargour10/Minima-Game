
import { Card, Player } from '../types';
import { calculateHandValue } from '../utils/cardUtils';

export class BotService {
  
  static executeTurn(
    bot: Player, 
    discardPile: Card[], 
    _deck: Card[],
    _allPlayers: Player[],
    callback: (action: 'SHOW' | 'PLAY_AND_DRAW', payload?: any) => void
  ) {
    const handValue = calculateHandValue(bot.hand);
    
    // 1. DECISION: SHOW or PLAY?
    // Heuristic: If hand value is very low (e.g. <= 6) and strict min seems plausible
    if (handValue <= 6) {
       callback('SHOW');
       return;
    }

    // 2. DECISION: PLAY
    // Strategy: Discard highest value card(s).
    // Identify singles and sets.
    
    const cardMap = new Map<string, number[]>(); // Rank -> indices
    bot.hand.forEach((card, index) => {
      const key = card.suit === '★' ? 'Joker' : card.rank;
      if (!cardMap.has(key)) cardMap.set(key, []);
      cardMap.get(key)?.push(index);
    });

    let bestDiscardIndices: number[] = [];
    let maxDiscardValue = -1;

    // Check singles
    bot.hand.forEach((card, index) => {
       if (card.value > maxDiscardValue) {
         maxDiscardValue = card.value;
         bestDiscardIndices = [index];
       }
    });

    // Check multiples (Pairs, Triples, etc.)
    cardMap.forEach((indices) => {
      if (indices.length > 1) {
         // Sum of this set
         const setSum = indices.reduce((sum, idx) => sum + bot.hand[idx].value, 0);
         
         // Prefer discarding set if sum is greater than current best single
         if (setSum > maxDiscardValue) {
           maxDiscardValue = setSum;
           bestDiscardIndices = indices;
         }
      }
    });

    // 3. DECISION: DRAW SOURCE
    // Look at Discard Pile top (this is the 'Earlier Top Card' because bots decide before modifying the pile)
    const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    let drawSource: 'DECK' | 'PILE' = 'DECK';

    if (topDiscard) {
      // If the top discard is very low (e.g. Ace, 2, Joker), take it.
      if (topDiscard.value <= 3) {
        drawSource = 'PILE';
      }
    }

    callback('PLAY_AND_DRAW', {
      discardIndices: bestDiscardIndices,
      drawSource
    });
  }
}
