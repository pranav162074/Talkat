import { useContext } from 'react';
import { SocketContext } from '../context/socketContext';

export const useSocket = () => useContext(SocketContext);