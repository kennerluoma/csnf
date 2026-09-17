import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'

/* The only way to build a conditional className. Never concatenate class strings (lint fails on
   template literals and + in className). Primitives own their styling, so there is no class
   conflict to merge; a variant prop is the way to change one. */
export const cn = (...inputs: Array<ClassValue>) => clsx(inputs)
