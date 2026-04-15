import { Mistake } from '../types';

const STORE_KEY = 'mistake_book_data';

export const getMistakes = (): Mistake[] => {
  const data = localStorage.getItem(STORE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Failed to parse mistakes from local storage', e);
    return [];
  }
};

export const saveMistake = (mistake: Mistake) => {
  const mistakes = getMistakes();
  mistakes.unshift(mistake);
  localStorage.setItem(STORE_KEY, JSON.stringify(mistakes));
};

export const updateMistake = (updatedMistake: Mistake) => {
  const mistakes = getMistakes();
  const index = mistakes.findIndex(m => m.id === updatedMistake.id);
  if (index !== -1) {
    mistakes[index] = updatedMistake;
    localStorage.setItem(STORE_KEY, JSON.stringify(mistakes));
  }
};

export const deleteMistake = (id: string) => {
  const mistakes = getMistakes();
  const filtered = mistakes.filter(m => m.id !== id);
  localStorage.setItem(STORE_KEY, JSON.stringify(filtered));
};
