export interface Project {
  id: string;
  title: string;
  description: string;
  tech: string[];
  link: string;
  image: string;
}

export interface BlogPost {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  readTime: string;
}

export interface Card {
  id: string;
  tech: string;
  icon: string;
  colors: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export enum GameState {
  IDLE,
  PLAYING,
  GAME_OVER,
  WIN
}

export interface GameStats {
  moves: number;
  matches: number;
  score: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}