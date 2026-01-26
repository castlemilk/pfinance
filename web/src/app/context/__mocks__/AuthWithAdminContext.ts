/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

export const useAuth = jest.fn();
export const AuthWithAdminProvider = ({ children }: { children: any }) => children;
