
export enum Suit {
  Hearts = '♥',
  Diamonds = '♦',
  Clubs = '♣',
  Spades = '♠',
  Joker = '★'
}

export enum Rank {
  Ace = 'A',
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Joker = 'Joker'
}

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
}

export interface Player {
  id: number;
  name: string;
  isBot: boolean;
  hand: Card[];
  score: number;
  lastAction?: string;
}

export enum GamePhase {
  SETUP = 'SETUP', // Enter Name / Choose Mode
  LOBBY = 'LOBBY', // Waiting for players
  PLAYING = 'PLAYING',
  ROUND_OVER = 'ROUND_OVER',
}

export enum TurnPhase {
  START = 'START', // Choose to Play or Show
  DISCARD_SELECTED = 'DISCARD_SELECTED', // Discarding cards
  DRAW = 'DRAW', // Drawing a card
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  winnerId: number | null;
  roundLog: string[];
  cardsPlayedThisTurn?: number;
  roomId?: string;
  hostId?: number;
}

// Network Types
export type NetworkMessageType = 'JOIN_REQUEST' | 'JOIN_ACK' | 'GAME_UPDATE' | 'PLAYER_ACTION';

export interface NetworkMessage {
  type: NetworkMessageType;
  roomId: string;
  payload: any;
}

export interface ActionPayload {
  actionType: 'DISCARD' | 'DRAW' | 'SHOW' | 'START_GAME';
  playerId: number;
  data?: any;
}
