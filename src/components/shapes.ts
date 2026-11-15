import { Circle, Diamond, Hexagon, Square, Star, Triangle } from 'lucide-react';

/** Hình dạng đi kèm màu ô đáp án – học sinh khiếm thị màu vẫn phân biệt được. */
export const SHAPES = [Triangle, Diamond, Circle, Square, Hexagon, Star];
export const optColor = (i: number) => `var(--opt-${i % 6})`;
