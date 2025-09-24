'use client';

import { http, createConfig, cookieStorage, createStorage } from 'wagmi';
import { monadTestnet } from '@/lib/chains';
import { walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export const config = createConfig({
  chains: [monadTestnet],
  ssr: true,
  storage: createStorage({  
    storage: cookieStorage, 
  }),
  connectors: [ 
    walletConnect({ projectId }), 
  ],
  transports: {
    [monadTestnet.id]: http(),
  },
});

