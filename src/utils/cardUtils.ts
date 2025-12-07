import { Card, Rank, Suit } from '../types';

export const CARD_VALUES: Record<string, number> = {
  [Rank.Ace]: 1,
  [Rank.Two]: 2,
  [Rank.Three]: 3,
  [Rank.Four]: 4,
  [Rank.Five]: 5,
  [Rank.Six]: 6,
  [Rank.Seven]: 7,
  [Rank.Eight]: 8,
  [Rank.Nine]: 9,
  [Rank.Ten]: 10,
  [Rank.Jack]: 10,
  [Rank.Queen]: 10,
  [Rank.King]: 10,
  [Rank.Joker]: 0,
};

export const createDeck = (numDecks: number = 1): Card[] => {
  const deck: Card[] = [];
  const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
  const ranks = [
    Rank.Ace, Rank.Two, Rank.Three, Rank.Four, Rank.Five, 
    Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, 
    Rank.Jack, Rank.Queen, Rank.King
  ];

  for (let d = 0; d < numDecks; d++) {
    // Standard cards
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          id: `${d}-${suit}-${rank}`,
          suit,
          rank,
          value: CARD_VALUES[rank],
        });
      }
    }
    // Jokers (2 per deck)
    deck.push({ id: `${d}-joker-1`, suit: Suit.Joker, rank: Rank.Joker, value: 0 });
    deck.push({ id: `${d}-joker-2`, suit: Suit.Joker, rank: Rank.Joker, value: 0 });
  }
  return shuffle(deck);
};

export const shuffle = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const calculateHandValue = (hand: Card[]): number => {
  return hand.reduce((sum, card) => sum + card.value, 0);
};

export const isValidDiscard = (selectedCards: Card[]): boolean => {
  if (selectedCards.length === 0) return false;
  if (selectedCards.length === 1) return true;

  // Multiple cards must have same rank (Joker counts as distinct rank 'Joker' here)
  const firstRank = selectedCards[0].rank;
  return selectedCards.every(card => card.rank === firstRank);
};

// Helper to get suit color
export const getSuitColor = (suit: Suit): string => {
  return (suit === Suit.Hearts || suit === Suit.Diamonds) ? 'text-red-500' : 'text-slate-800';
};