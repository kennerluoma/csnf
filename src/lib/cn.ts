import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/* The only way to build a conditional className: clsx for the conditions, tailwind-merge so a
   caller's `className` wins over a primitive's defaults. Never concatenate class strings. */
export const cn = (...inputs: Array<ClassValue>) => twMerge(clsx(inputs))
