
'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { TOKENS, SWAP_PAIRS, type Token, GAME_CONFIG, TOKEN_ADDRESSES } from '@/lib/constants';
import { MonBirdIcon, UsdcBirdIcon, WethBirdIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast'; 
import { useAccount, useConnect, useDisconnect, useSendTransaction, useBalance } from 'wagmi';
import { parseEther } from 'viem';

type GameState = 'ready' | 'aiming' | 'flying' | 'hit' | 'miss' | 'swapping' | 'gameover';

type Vector2D = { x: number; y: number };

type Block = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isHit: boolean;
};

type TowerStructure = {
  token: Token;
  blocks: Block[];
};


const BIRD_ICONS: Record<Token, React.FC<any>> = {
  USDC: UsdcBirdIcon,
  MON: MonBirdIcon,
  WETH: WethBirdIcon,
};

function generateTower(token: Token, index: number, gameAreaWidth: number): TowerStructure {
  const blocks: Block[] = [];
  const base_x = gameAreaWidth - 300 - (index * 180); // Better spacing
  const blockWidth = 40;
  const blockHeight = 20;
  const levels = Math.floor(Math.random() * 3) + 3; // 3 to 5 levels for better gameplay

  let blockCount = 0;
  for (let level = 0; level < levels; level++) {
    const numBlocks = Math.max(1, levels - level);
    const levelWidth = numBlocks * blockWidth;
    const startX = base_x + (GAME_CONFIG.towerWidth - levelWidth) / 2;
    for (let i = 0; i < numBlocks; i++) {
      blocks.push({
        id: `${token}-${blockCount++}`,
        x: startX + i * blockWidth,
        y: level * blockHeight, // Y is distance from ground, not absolute position
        width: blockWidth,
        height: blockHeight,
        isHit: false,
      });
    }
  }

  // Add target block at the top
  const topY = levels * blockHeight;
  blocks.push({
    id: `${token}-target`,
    x: base_x + (GAME_CONFIG.towerWidth - 60) / 2, // Slightly smaller target
    y: topY,
    width: 60,
    height: 60,
    isHit: false,
  });

  return { token, blocks };
}


export function DeFiBirdsGame() {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [selectedBird, setSelectedBird] = useState<Token>('MON');
  
  // Debug logging for selectedBird changes
  useEffect(() => {
    console.log('selectedBird changed to:', selectedBird);
  }, [selectedBird]);
  const [chances, setChances] = useState(3);
  
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  
  const { data: monBalance } = useBalance({ address, chainId: 10143,});
  const { data: usdcBalance } = useBalance({ address, token: TOKEN_ADDRESSES.USDC });
  const { data: wethBalance } = useBalance({ address, token: TOKEN_ADDRESSES.WETH });

  const balances: Record<Token, number> = {
    MON: parseFloat(monBalance?.formatted || '0'),
    USDC: parseFloat(usdcBalance?.formatted || '0'),
    WETH: parseFloat(wethBalance?.formatted || '0'),
  };
  
  const [towers, setTowers] = useState<TowerStructure[]>([]);
  const [hitTower, setHitTower] = useState<Token | null>(null);

  const [birdPosition, setBirdPosition] = useState<Vector2D>(GAME_CONFIG.slingshotPosition);
  const [birdVelocity, setBirdVelocity] = useState<Vector2D>({ x: 0, y: 0 });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Vector2D>({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = useState<Vector2D>(GAME_CONFIG.slingshotPosition);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const { toast } = useToast();
  
  const resetBird = useCallback(() => {
    setBirdPosition(GAME_CONFIG.slingshotPosition);
    setBirdVelocity({ x: 0, y: 0 });
    setGameState('ready');
    setHitTower(null);
  }, []);

  const setupTowers = useCallback(() => {
    const gameArea = gameAreaRef.current;
    if (!gameArea) return;
    const width = gameArea.getBoundingClientRect().width;
    const possibleTargets = SWAP_PAIRS[selectedBird];
    setTowers(possibleTargets.map((token, index) => generateTower(token, index, width)));
  }, [selectedBird]);

  const handleNewTurn = useCallback(() => {
    resetBird();
    setupTowers();
    setChances(3);
  }, [resetBird, setupTowers]);
  
  useEffect(() => {
    handleNewTurn();
  }, [selectedBird, handleNewTurn]);
  
  const handleSwap = useCallback(async (fromToken: Token, toToken: Token) => {
    if (!isConnected || !address) {
      toast({ title: 'Wallet not connected', description: 'Please connect your wallet to swap tokens.', variant: 'destructive' });
      return;
    }
    
    const sellAmount = parseEther('0.01'); // Example: swap 0.01 of the token
    const sellTokenAddress = TOKEN_ADDRESSES[fromToken];
    const buyTokenAddress = TOKEN_ADDRESSES[toToken];

    try {
      const response = await fetch(`/api/0x/quote?buyToken=${buyTokenAddress}&sellToken=${sellTokenAddress}&sellAmount=${sellAmount.toString()}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch swap quote.');
      }
      const quote = await response.json();

      await sendTransactionAsync({
        to: quote.to,
        data: quote.data,
        value: BigInt(quote.value),
        gas: BigInt(quote.gas),
      });

      toast({
        title: 'Swap Submitted!',
        description: `Your swap from ${fromToken} to ${toToken} is being processed.`,
      });

    } catch (error) {
       toast({
        title: 'Swap Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
       setTimeout(() => {
          handleNewTurn();
      }, 1000);
    }
  }, [isConnected, address, toast, handleNewTurn, sendTransactionAsync]);

  const gameLoop = useCallback(() => {
    if (gameState !== 'flying') return;

    setBirdPosition(prevPos => {
      const newPos = {
        x: prevPos.x + birdVelocity.x,
        y: prevPos.y + birdVelocity.y,
      };

      const gameArea = gameAreaRef.current?.getBoundingClientRect();
      if (!gameArea) return newPos;
      
      const groundY = gameArea.height - GAME_CONFIG.groundHeight;

      if (newPos.y > groundY - GAME_CONFIG.birdSize.height / 2 || newPos.y < 0) {
        setGameState('miss');
        return prevPos;
      }
      
      if (newPos.x < 0 || newPos.x > gameArea.width) {
        setGameState('miss');
        return prevPos;
      }

      let collision = false;
      setTowers(currentTowers => 
        currentTowers.map(tower => {
          const updatedBlocks = tower.blocks.map(block => {
            // Calculate block's actual position relative to ground
            const blockTop = groundY - GAME_CONFIG.groundHeight - block.y - block.height;
            const blockBottom = groundY - GAME_CONFIG.groundHeight - block.y;
            
            if (!block.isHit && 
              // X collision check
              newPos.x + GAME_CONFIG.birdSize.width / 2 > block.x && 
              newPos.x - GAME_CONFIG.birdSize.width / 2 < block.x + block.width &&
              // Y collision check
              newPos.y + GAME_CONFIG.birdSize.height / 2 > blockTop && 
              newPos.y - GAME_CONFIG.birdSize.height / 2 < blockBottom
            ) {
              collision = true;
              if (block.id.includes('target')) {
                setHitTower(tower.token);
              }
              return { ...block, isHit: true };
            }
            return block;
          });
          return { ...tower, blocks: updatedBlocks };
        })
      );
      
      if (collision) {
        setGameState('hit');
      }
      
      return newPos;
    });

    setBirdVelocity(prevVel => ({
      x: prevVel.x * 0.995,
      y: prevVel.y + GAME_CONFIG.gravity,
    }));

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, birdVelocity.x, birdVelocity.y]);

  useEffect(() => {
    if (gameState === 'flying') {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, gameLoop]);
  
  useEffect(() => {
    if (gameState === 'hit' && hitTower) {
      setGameState('swapping');
      handleSwap(selectedBird, hitTower);
    } else if (gameState === 'miss' || (gameState === 'hit' && !hitTower)) {
        if (chances > 1) {
            setChances(prev => prev - 1);
            setTimeout(() => {
                resetBird();
            }, 1500);
        } else {
            setGameState('gameover');
        }
    }
  }, [gameState, hitTower, selectedBird, toast, resetBird, chances, handleSwap]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse down event:', { gameState, isConnected, target: e.target });
    if (gameState !== 'ready' || !isConnected) return; // Temporarily removed balance check
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    console.log('Click position:', { x, y, slingshot: GAME_CONFIG.slingshotPosition });
    
    const distFromSlingshot = Math.sqrt(
      (x - GAME_CONFIG.slingshotPosition.x)**2 + (y - GAME_CONFIG.slingshotPosition.y)**2
    );

    console.log('Distance from slingshot:', distFromSlingshot, 'required:', GAME_CONFIG.birdSize.width);

    if (distFromSlingshot > GAME_CONFIG.birdSize.width) return;

    console.log('Starting drag...');
    setGameState('aiming');
    setIsDragging(true);
    setDragStart({ x, y });
    setDragEnd(GAME_CONFIG.slingshotPosition);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    
    const dx = currentPos.x - GAME_CONFIG.slingshotPosition.x;
    const dy = currentPos.y - GAME_CONFIG.slingshotPosition.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    dist = Math.min(dist, GAME_CONFIG.maxDragDistance);
    const angle = Math.atan2(dy, dx);
    
    setDragEnd({
        x: GAME_CONFIG.slingshotPosition.x + Math.cos(angle) * dist,
        y: GAME_CONFIG.slingshotPosition.y + Math.sin(angle) * dist,
    });
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const dx = GAME_CONFIG.slingshotPosition.x - dragEnd.x;
    const dy = GAME_CONFIG.slingshotPosition.y - dragEnd.y;

    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        setGameState('ready');
        return;
    }

    setGameState('flying');
    
    setBirdVelocity({
        x: dx * GAME_CONFIG.launchPower,
        y: dy * GAME_CONFIG.launchPower,
    });
  };
  
  const trajectoryPoints = () => {
    if (!isDragging) return [];
    const points = [];
    let simPos = { ...GAME_CONFIG.slingshotPosition };
    const dx = GAME_CONFIG.slingshotPosition.x - dragEnd.x;
    const dy = GAME_CONFIG.slingshotPosition.y - dragEnd.y;
    let simVel = {
        x: dx * GAME_CONFIG.launchPower,
        y: dy * GAME_CONFIG.launchPower
    };

    for (let i = 0; i < 30; i++) {
        simVel.y += GAME_CONFIG.gravity;
        simPos.x += simVel.x;
        simPos.y += simVel.y;
        if(i % 2 === 0) points.push({ ...simPos });
    }
    return points;
  };
  
  const Bird = BIRD_ICONS[selectedBird];

  return (
    <div
      ref={gameAreaRef}
      className="relative w-full h-[600px] max-w-5xl bg-transparent overflow-hidden select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: gameState === 'ready' && isConnected ? 'grab' : 'default' }}
    > 
      <div 
        className="fixed top-4 left-4 p-4 bg-white/80 rounded-lg shadow-md backdrop-blur-sm z-30"
        style={{ pointerEvents: 'auto' }}
      >
        <h2 className="text-lg font-bold">Balances</h2>
        {Object.entries(balances).map(([token, balance]) => (
          <p key={token}>{token}: {balance.toFixed(4)}</p>
        ))}
        <h2 className="text-lg font-bold mt-2">Chances</h2>
        <p>{chances}</p>
        <div className="mt-4">
          {isConnected ? (
            <div>
              <p className="text-xs truncate">Connected: {address}</p>
              <Button size="sm" variant="outline" onClick={() => disconnect()} className="mt-1 w-full">Disconnect</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {connectors.map((connector) => (
                <Button key={connector.uid} onClick={() => connect({ connector })} disabled={isConnecting}>
                  {isConnecting ? 'Connecting...' : `Connect ${connector.name}`}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Bird Selection UI - Positioned to avoid overlap */}
      <div 
        className="fixed w-48 bottom-4 left-0 p-3 bg-white/90 rounded-xl shadow-lg backdrop-blur-sm z-30"
        style={{ pointerEvents: 'auto' }}
      >
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Select Bird</h3>
        <div className="flex gap-2">
          {Object.keys(TOKENS).map(token => {
            const balance = balances[token as Token];
            const isSelected = selectedBird === token;
            const hasBalance = balance > 0 || true; // Temporarily allow all selections for testing
            
            return (
              <button 
                key={token} 
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Bird selection clicked:', token, 'current selected:', selectedBird);
                  setSelectedBird(token as Token);
                }} 
                disabled={false} // Temporarily enable all buttons
                className={`
                  relative p-3 rounded-lg transition-all duration-200 
                  ${isSelected ? 'bg-blue-500 ring-2 ring-blue-300 shadow-lg scale-105' : 'bg-gray-100 hover:bg-gray-200'} 
                  ${hasBalance ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed opacity-50'}
                `}
              >
                {React.createElement(BIRD_ICONS[token as Token], { 
                  className: `w-8 h-8 ${isSelected ? 'text-white' : 'text-gray-600'}` 
                })}
                <div className={`text-xs mt-1 ${isSelected ? 'text-white' : 'text-gray-600'}`}>
                  {balance.toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Game Status UI */}
      <div 
        className="absolute top-4 right-4 p-3 bg-white/90 rounded-xl shadow-lg backdrop-blur-sm z-30"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="text-sm font-semibold text-gray-700 mb-1">Chances: {chances}</div>
        <div className="text-xs text-gray-600">
          {gameState === 'ready' && 'Aim and shoot!'}
          {gameState === 'aiming' && 'Pull to aim...'}
          {gameState === 'flying' && 'Bird in flight!'}
          {gameState === 'swapping' && 'Swapping tokens...'}
          {gameState === 'hit' && 'Nice shot!'}
          {gameState === 'miss' && 'Try again!'}
        </div>
      </div>

      <AnimatePresence>
        {towers.map(tower => 
          tower.blocks.map(block => {
              const isTargetBlock = block.id.includes('target');
              const isSwapping = gameState === 'swapping' && hitTower === tower.token;
              
              return (
                <motion.div
                  key={block.id}
                  initial={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                  animate={{
                    opacity: block.isHit ? 0 : 1,
                    scale: block.isHit ? 0.2 : 1,
                    rotate: block.isHit ? (Math.random() - 0.5) * 180 : 0,
                    y: block.isHit ? 100 : 0,
                  }}
                  transition={{ duration: 0.4, type: 'spring' }}
                  className="absolute"
                  style={{
                    width: block.width,
                    height: block.height,
                    left: block.x,
                    bottom: GAME_CONFIG.groundHeight + block.y,
                  }}
                >
                  {isTargetBlock ? (
                    <div className="relative w-full h-full bg-yellow-900/50 rounded-md flex flex-col items-center justify-between p-2">
                      <AnimatePresence>
                        {isSwapping && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md z-10"
                          >
                            <Loader2 className="w-12 h-12 text-white animate-spin" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <h3 className="text-xl font-bold text-white">{tower.token}</h3>
                      {React.createElement(TOKENS[tower.token].icon, { className: 'w-10 h-10' })}
                      <ArrowLeftRight className="w-6 h-6 text-white" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-yellow-900/80 rounded-sm" />
                  )}
                </motion.div>
              );
            }
          )
        )}
      </AnimatePresence>

      <div 
        className="absolute w-8 h-20 bg-yellow-900 rounded-md"
        style={{ left: GAME_CONFIG.slingshotPosition.x - 20, bottom: GAME_CONFIG.groundHeight - 20 }}
      ></div>
      <div 
        className="absolute w-2 h-20 bg-yellow-800 rounded-b-md"
        style={{ left: GAME_CONFIG.slingshotPosition.x + 8, bottom: GAME_CONFIG.groundHeight - 20, transform: 'rotate(10deg)' }}
      ></div>
      <div 
        className="absolute w-2 h-20 bg-yellow-800 rounded-b-md"
        style={{ left: GAME_CONFIG.slingshotPosition.x - 10, bottom: GAME_CONFIG.groundHeight - 20, transform: 'rotate(-10deg)' }}
      ></div>

      {isDragging &&
        trajectoryPoints().map((p, i) => (
          <div
            key={i}
            className="absolute bg-white/50 rounded-full"
            style={{ left: p.x, top: p.y, width: 5, height: 5 }}
          />
        ))}

      <AnimatePresence>
        {gameState !== 'flying' && gameState !== 'hit' && gameState !== 'swapping' &&
          <motion.div 
            key={`${selectedBird}-${chances}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            style={{ position: 'absolute', left: dragEnd.x - GAME_CONFIG.birdSize.width/2, top: dragEnd.y - GAME_CONFIG.birdSize.height/2, pointerEvents: 'none' }}>
            <Bird className="w-12 h-12" />
          </motion.div>
        }
      </AnimatePresence>
      
      {gameState === 'flying' &&
        <div style={{ position: 'absolute', transform: `translate(${birdPosition.x - GAME_CONFIG.birdSize.width/2}px, ${birdPosition.y - GAME_CONFIG.birdSize.height/2}px) rotate(${birdVelocity.y * 2}deg)`, transformOrigin: 'center', pointerEvents: 'none' }}>
           <Bird className="w-12 h-12" />
        </div>
      }
      
      {gameState === 'gameover' && 
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className='p-8 bg-white/90 rounded-lg shadow-xl text-center'>
              <h2 className='text-3xl font-bold mb-4'>No more chances!</h2>
              <p className='mb-6'>Select a different bird to continue.</p>
              <Button onClick={() => setSelectedBird(selectedBird)}>Try again with {selectedBird}</Button>
            </div>
        </div>
      }

      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            <div className='p-8 bg-white/90 rounded-lg shadow-xl text-center'>
              <h2 className='text-3xl font-bold mb-4'>Connect Your Wallet</h2>
              <p className='mb-6'>Please connect your wallet to play the game.</p>
              <div className="flex flex-col gap-2">
                {connectors.map((connector) => (
                  <Button key={connector.uid} onClick={() => connect({ connector })} disabled={isConnecting}>
                    {isConnecting ? 'Connecting...' : `Connect ${connector.name}`}
                  </Button>
                ))}
              </div>
            </div>
        </div>
      )}
    </div>
  );
}

    
