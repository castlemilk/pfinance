/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

export const useFinance = jest.fn();
export const FinanceProvider = ({ children }: { children: any }) => children;
