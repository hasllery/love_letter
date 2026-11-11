import type { Rank } from '@court/shared';

const files = [
  'spy.jpeg',
  'guard.jpeg',
  'priest.jpeg',
  'baron.jpeg',
  'handmaid.jpeg',
  'prince.jpeg',
  'chancellor.jpeg',
  'king.png',
  'countess.jpeg',
  'princess.jpeg',
] as const;
export function cardImage(rank: Rank): string {
  return `${import.meta.env.BASE_URL}cards/${files[rank]}`;
}
export const referenceImage = `${import.meta.env.BASE_URL}cards/reference.png`;
export function preloadCardArt(): void {
  for (const file of [...files, 'reference.png']) {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}cards/${file}`;
  }
}
