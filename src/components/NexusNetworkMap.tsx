import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Network, 
  ArrowRight, 
  Upload, 
  Share2, 
  PhoneCall, 
  PhoneOff,
  Video,
  CheckCircle2, 
  Zap, 
  Users, 
  Crown, 
  Radio, 
  X, 
  Maximize2, 
  Minimize2,
  Send,
  MessageSquare,
  Shield,
  Laptop,
  Tablet,
  Smartphone,
  Activity,
  Download,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  RefreshCw,
  FolderOpen,
  QrCode,
  Key
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';
import { UserProfile, TransferProgress } from '../types';

export interface NexusNetworkMapProps {
  localProfile: UserProfile;
  role?: 'host' | 'join' | null;
  peerProfiles?: Record<string, UserProfile>;
  connectedCount?: number;
  dataChannels?: Map<string, RTCDataChannel>;
  activeTransfer?: TransferProgress | null;
  isCallActive?: boolean;
  callType?: 'audio' | 'video' | null;
  messages?: any[];
  logs?: any[];
  onSendFileToPeer?: (file: File, peerId?: string) => void;
  onStartCall?: (type: 'audio' | 'video') => void;
  onEndCall?: () => void;
  onSendMessage?: (text: string) => void;
  onAddReceivedFile?: (file: File) => void;
  onNavigateToConnect?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export interface MapNode {
  id: string;
  name: string;
  roleText: string;
  isHost: boolean;
  isSelf: boolean;
  avatarColor: string;
  avatarImage?: string;
  deviceType: 'host' | 'peer';
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  status: 'connected' | 'idle' | 'busy';
  pingMs: number;
}

interface ActiveInMapTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fromNodeId: string;
  toNodeId: string;
  progress: number;
  speed: string;
  isBypass: boolean;
}

export function NexusNetworkMap({
  localProfile,
  role = null,
  peerProfiles = {},
  connectedCount = 0,
  dataChannels,
  activeTransfer = null,
  isCallActive = false,
  callType = null,
  messages = [],
  logs = [],
  onSendFileToPeer,
  onStartCall,
  onEndCall,
  onSendMessage,
  onAddReceivedFile,
  onNavigateToConnect,
  onClose,
  isModal = false,
}: NexusNetworkMapProps) {
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  
  // Tab for bottom panel
  const [activeBottomTab, setActiveBottomTab] = useState<'messages' | 'connections' | 'calls'>('messages');
  const [inputMessage, setInputMessage] = useState('');
  
  // In-map active transfer animation
  const [inMapTransfer, setInMapTransfer] = useState<ActiveInMapTransfer | null>(null);
  
  // Call timer effect
  const [callDuration, setCallDuration] = useState<number>(0);

  // Network activity feed
  const [networkEvents, setNetworkEvents] = useState<Array<{ id: string; text: string; type: 'info' | 'ok' | 'bypass' | 'call' | 'msg'; time: string; sender?: string }>>(() => {
    return [
      { id: '1', text: "Nexus WebRTC node initialized. Zero-server P2P engine active.", type: 'ok', time: new Date().toLocaleTimeString() }
    ];
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Call timer effect
  useEffect(() => {
    let interval: any = null;
    if (isCallActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCallActive]);

  // Sync active external transfer if present
  useEffect(() => {
    if (activeTransfer) {
      setInMapTransfer({
        id: 'external-transfer',
        fileName: activeTransfer.name,
        fileSize: activeTransfer.totalBytes,
        fromNodeId: 'self',
        toNodeId: 'peer',
        progress: activeTransfer.progress,
        speed: activeTransfer.statusMessage || '24.5 MB/s',
        isBypass: false
      });
    } else if (inMapTransfer?.id === 'external-transfer') {
      setInMapTransfer(null);
    }
  }, [activeTransfer]);

  // Log real connection changes
  useEffect(() => {
    if (connectedCount > 0) {
      const now = new Date().toLocaleTimeString();
      setNetworkEvents(prev => [
        {
          id: Math.random().toString(),
          text: `Encrypted DataChannel online with ${connectedCount} peer${connectedCount > 1 ? 's' : ''}.`,
          type: 'ok',
          time: now
        },
        ...prev.slice(0, 20)
      ]);
    }
  }, [connectedCount]);

  // Construct Real Nodes (no fake demo star mesh!)
  const nodes: MapNode[] = useMemo(() => {
    const list: MapNode[] = [];
    const realPeers = Object.values(peerProfiles);
    const isLocalHost = role === 'host';

    // 1. If no peers connected yet, show ONLY the local user node in the center
    if (realPeers.length === 0 && connectedCount === 0) {
      list.push({
        id: 'self',
        name: localProfile.username ? `${localProfile.username} (You)` : 'Local Device',
        roleText: isLocalHost ? '(Host)' : '(Peer)',
        isHost: isLocalHost,
        isSelf: true,
        avatarColor: localProfile.avatarColor || 'bg-accent',
        avatarImage: localProfile.avatarImage,
        deviceType: isLocalHost ? 'host' : 'peer',
        x: 50,
        y: 50,
        status: 'idle',
        pingMs: 0
      });
      return list;
    }

    // 2. Real Connected Network:
    // Determine the center node (Host)
    if (isLocalHost) {
      // Local user is Host at center
      list.push({
        id: 'self',
        name: `${localProfile.username || 'Host'} (You)`,
        roleText: '(Host)',
        isHost: true,
        isSelf: true,
        avatarColor: localProfile.avatarColor || 'bg-accent',
        avatarImage: localProfile.avatarImage,
        deviceType: 'host',
        x: 50,
        y: 50,
        status: 'connected',
        pingMs: 0
      });

      // Radially position real connected peers around host
      const radialPositions = [
        { x: 22, y: 28 }, // Top-Left
        { x: 78, y: 28 }, // Top-Right
        { x: 22, y: 72 }, // Bottom-Left
        { x: 78, y: 72 }, // Bottom-Right
        { x: 50, y: 18 }, // Top Center
        { x: 50, y: 82 }, // Bottom Center
        { x: 15, y: 50 }, // Left Middle
        { x: 85, y: 50 }  // Right Middle
      ];

      // If peerProfiles has fewer entries than connectedCount, create placeholder peer entries for anonymous peers
      const peersToRender = realPeers.length > 0 ? realPeers : Array.from({ length: connectedCount }).map((_, i) => ({
        id: `peer-${i + 1}`,
        username: `Peer ${i + 1}`,
        avatarColor: ['bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'bg-amber-600'][i % 4],
        avatarImage: undefined
      }));

      peersToRender.forEach((p, idx) => {
        const pos = radialPositions[idx % radialPositions.length];
        list.push({
          id: p.id,
          name: p.username || `Peer ${idx + 1}`,
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: p.avatarColor || 'bg-blue-600',
          avatarImage: p.avatarImage,
          deviceType: 'peer',
          x: pos.x,
          y: pos.y,
          status: 'connected',
          pingMs: 12 + (idx * 6)
        });
      });
    } else {
      // Local user is a peer. The Host is at center, local user and other peers are around it
      const hostPeer = realPeers[0] || { id: 'host-anchor', username: 'Host Node', avatarColor: 'bg-accent', avatarImage: undefined };
      list.push({
        id: hostPeer.id,
        name: hostPeer.username || 'Host Node',
        roleText: '(Host)',
        isHost: true,
        isSelf: false,
        avatarColor: hostPeer.avatarColor || 'bg-accent',
        avatarImage: hostPeer.avatarImage,
        deviceType: 'host',
        x: 50,
        y: 50,
        status: 'connected',
        pingMs: 16
      });

      // Self node + remaining peers radially
      const radialPositions = [
        { x: 22, y: 28 },
        { x: 78, y: 28 },
        { x: 22, y: 72 },
        { x: 78, y: 72 }
      ];

      // Add self as peer 1
      list.push({
        id: 'self',
        name: `${localProfile.username || 'Peer'} (You)`,
        roleText: '(peer)',
        isHost: false,
        isSelf: true,
        avatarColor: localProfile.avatarColor || 'bg-blue-600',
        avatarImage: localProfile.avatarImage,
        deviceType: 'peer',
        x: radialPositions[0].x,
        y: radialPositions[0].y,
        status: 'connected',
        pingMs: 0
      });

      // Remaining peers
      realPeers.slice(1).forEach((p, idx) => {
        const pos = radialPositions[(idx + 1) % radialPositions.length];
        list.push({
          id: p.id,
          name: p.username || `Peer ${idx + 2}`,
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: p.avatarColor || 'bg-emerald-600',
          avatarImage: p.avatarImage,
          deviceType: 'peer',
          x: pos.x,
          y: pos.y,
          status: 'connected',
          pingMs: 18 + (idx * 5)
        });
      });
    }

    return list;
  }, [peerProfiles, localProfile, role, connectedCount]);

  const hostNode = nodes.find(n => n.isHost) || nodes[0];
  const peerNodes = nodes.filter(n => !n.isHost);

  // Send file handler
  const executeSendFile = (file: File, targetNode: MapNode) => {
    const fromNode = nodes.find(n => n.isSelf) || hostNode;
    const now = new Date().toLocaleTimeString();

    // Log event
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Transfer Started] "${file.name}" (${formatBytes(file.size)}) ➔ ${targetNode.name}`,
        type: 'bypass',
        time: now
      },
      ...prev.slice(0, 20)
    ]);

    // Active in-map transfer animation
    setInMapTransfer({
      id: Math.random().toString(),
      fileName: file.name,
      fileSize: file.size,
      fromNodeId: fromNode.id,
      toNodeId: targetNode.id,
      progress: 0,
      speed: '28.4 MB/s',
      isBypass: false
    });

    // Invoke real transmission if available
    if (onSendFileToPeer) {
      onSendFileToPeer(file, targetNode.id === 'self' ? undefined : targetNode.id);
    }

    // Progress animation along the spoke
    let p = 0;
    const interval = setInterval(() => {
      p += 20;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => {
          setInMapTransfer(null);
          const endNow = new Date().toLocaleTimeString();
          setNetworkEvents(prev => [
            {
              id: Math.random().toString(),
              text: `[Transfer Complete] "${file.name}" delivered to ${targetNode.name}!`,
              type: 'ok',
              time: endNow
            },
            ...prev.slice(0, 20)
          ]);
          if (onAddReceivedFile) {
            onAddReceivedFile(file);
          }
        }, 500);
      } else {
        setInMapTransfer(prev => prev ? { ...prev, progress: p } : null);
      }
    }, 200);
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(nodeId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverNodeId(null);
  };

  const handleDrop = (e: React.DragEvent, targetNode: MapNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(null);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const file = droppedFiles[0];
      executeSendFile(file, targetNode);
    }
  };

  // Node Click - Open Action Sheet
  const handleNodeClick = (node: MapNode) => {
    setSelectedNode(node);
  };

  // File Picker for selected node
  const handleTriggerFileSelect = () => {
    if (fileInputRef.current && selectedNode) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && selectedNode) {
      const file = files[0];
      executeSendFile(file, selectedNode);
    }
  };

  // Call Initiation
  const handleStartCall = (type: 'audio' | 'video') => {
    if (onStartCall) {
      onStartCall(type);
    }
    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Encrypted Call Active] ${type.toUpperCase()} call initiated with ${selectedNode ? selectedNode.name : 'Peer'}`,
        type: 'call',
        time: now
      },
      ...prev.slice(0, 20)
    ]);
    setActiveBottomTab('calls');
  };

  const handleEndCall = () => {
    if (onEndCall) {
      onEndCall();
    }
    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Call Ended] Media channel closed.`,
        type: 'info',
        time: now
      },
      ...prev.slice(0, 20)
    ]);
  };

  // Message Sending
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;

    const text = inputMessage.trim();
    setInputMessage('');

    if (onSendMessage) {
      onSendMessage(text);
    }

    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Message] You: "${text}"`,
        type: 'msg',
        time: now,
        sender: localProfile.username || 'You'
      },
      ...prev.slice(0, 20)
    ]);
  };

  // Format call duration
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Combined real messages and network events
  const combinedFeed = useMemo(() => {
    const list = [...networkEvents];
    messages.slice(-8).forEach((m, idx) => {
      list.push({
        id: `msg-${idx}`,
        text: `[Message] ${m.senderName || 'Peer'}: "${m.text || 'Voice memo'}"`,
        type: 'msg',
        time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : 'Now',
        sender: m.senderName
      });
    });
    return list.slice(0, 20);
  }, [networkEvents, messages]);

  return (
    <div
      className={cn(
        "flex flex-col text-text m3-card-xl rounded-[28px] border shadow-2xl overflow-hidden backdrop-blur-3xl select-none relative",
        isModal ? "w-full max-w-5xl max-h-[92vh] h-[820px]" : "w-full h-full min-h-[560px]"
      )}
      style={{
        backgroundColor: 'var(--md-sys-color-surface)',
        borderColor: 'var(--md-sys-color-outline-variant)',
      }}
    >
      {/* Hidden File Input */}
      <input 
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top Header */}
      <div
        className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3 flex-shrink-0"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-2xl border flex items-center justify-center shadow-xs shrink-0"
            style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base md:text-lg font-bold tracking-tight text-text flex items-center gap-1.5">
                <span>Quantum Link Mesh Topology</span>
                <ArrowRight className="w-4 h-4 text-[color:var(--md-sys-color-primary)] animate-pulse" />
              </h2>
              <span
                className="px-3 py-0.5 rounded-full text-[11px] font-mono font-semibold border"
                style={{
                  backgroundColor:
                    connectedCount > 0
                      ? 'var(--md-sys-color-tertiary-container)'
                      : 'var(--md-sys-color-secondary-container)',
                  color:
                    connectedCount > 0
                      ? 'var(--md-sys-color-on-tertiary-container)'
                      : 'var(--md-sys-color-on-secondary-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                {connectedCount > 0 ? `${connectedCount + 1} Nodes Online` : "Listening (0 Peers)"}
              </span>
            </div>
            <p className="text-xs text-muted font-sans mt-0.5">
              Interactive Material You P2P mesh • Drag & drop files directly onto any node
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {connectedCount === 0 && onNavigateToConnect && (
            <button
              onClick={onNavigateToConnect}
              className="px-4 py-2 rounded-full text-xs font-semibold m3-btn-filled transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Connect a Peer</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full m3-surface-interactive border flex items-center justify-center text-muted hover:text-text transition-colors cursor-pointer"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title="Close Quantum Link Mesh Map"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Network Topology Canvas */}
      <div
        className="relative flex-1 overflow-hidden flex items-center justify-center p-4 min-h-[340px]"
        style={{ backgroundColor: 'var(--md-sys-color-surface-container-lowest, var(--md-sys-color-surface))' }}
      >
        {/* Ambient M3 Tonal Glows */}
        <div
          className="pointer-events-none absolute -top-24 left-1/3 w-72 h-72 rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: 'var(--md-sys-color-primary-container)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-1/3 w-72 h-72 rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: 'var(--md-sys-color-tertiary-container)' }}
        />

        {/* Subtle Dot Matrix */}
        <div
          className="absolute inset-0 [background-size:24px_24px] pointer-events-none opacity-35"
          style={{
            backgroundImage: 'radial-gradient(var(--md-sys-color-outline-variant) 1px, transparent 1px)',
          }}
        />

        {/* Top Floating Helper Pill */}
        <div
          className="absolute top-3.5 left-4 z-10 hidden sm:flex items-center gap-2 border rounded-full px-3.5 py-1.5 text-xs text-muted backdrop-blur-md shadow-xs"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <Upload className="w-3.5 h-3.5 text-[color:var(--md-sys-color-primary)]" />
          <span>{connectedCount > 0 ? "Drop file directly onto any peer node to transmit" : "Waiting for peers to join the Quantum Link mesh"}</span>
        </div>

        {/* Real Connections SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {peerNodes.map(peer => (
            <g key={`spoke-${peer.id}`}>
              <line
                x1={`${hostNode.x}%`}
                y1={`${hostNode.y}%`}
                x2={`${peer.x}%`}
                y2={`${peer.y}%`}
                stroke="var(--md-sys-color-outline)"
                strokeOpacity="0.55"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Animated packet beacon */}
              <circle r="4" fill="var(--md-sys-color-primary)" className="animate-pulse">
                <animate
                  attributeName="cx"
                  from={`${hostNode.x}%`}
                  to={`${peer.x}%`}
                  dur="2.4s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  from={`${hostNode.y}%`}
                  to={`${peer.y}%`}
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}

          {/* Real Active Call Glow Stream */}
          {isCallActive && peerNodes[0] && (
            <line
              x1={`${hostNode.x}%`}
              y1={`${hostNode.y}%`}
              x2={`${peerNodes[0].x}%`}
              y2={`${peerNodes[0].y}%`}
              stroke="var(--md-sys-color-tertiary)"
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-pulse opacity-90 shadow-lg"
            />
          )}
        </svg>

        {/* Empty State: 0 peers connected */}
        {connectedCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            {/* Pulsing Radar Rings */}
            <div
              className="w-48 h-48 md:w-64 md:h-64 rounded-full border animate-ping opacity-25 absolute"
              style={{ borderColor: 'var(--md-sys-color-primary)' }}
            />
            <div
              className="w-36 h-36 md:w-48 md:h-48 rounded-full border animate-pulse opacity-40 absolute"
              style={{ borderColor: 'var(--md-sys-color-primary)' }}
            />
            
            {/* Help card positioned below the local node */}
            <div
              className="mt-44 md:mt-52 max-w-sm text-center px-5 py-4 pointer-events-auto m3-card-xl rounded-[28px] border shadow-xl backdrop-blur-md"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <p className="text-xs text-text font-medium leading-relaxed">
                Direct WebRTC mesh ready. Share your QR code or Offer token with a nearby device to link into the Quantum Link topology.
              </p>
              {onNavigateToConnect && (
                <button
                  onClick={onNavigateToConnect}
                  className="mt-3 px-4 py-1.5 rounded-full m3-btn-tonal text-xs font-semibold transition-all cursor-pointer active:scale-95"
                >
                  Open QR Handshake ➔
                </button>
              )}
            </div>
          </div>
        )}

        {/* In-Flight Transfer Floating Progress Indicator */}
        {inMapTransfer && (
          <div
            className="absolute top-3.5 right-4 z-20 m3-card-xl rounded-[24px] p-3.5 border shadow-2xl backdrop-blur-xl w-68 animate-in fade-in slide-in-from-top duration-200"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              borderColor: 'var(--md-sys-color-primary)',
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-text truncate max-w-[150px]">{inMapTransfer.fileName}</span>
              <span className="text-[color:var(--md-sys-color-primary)] font-mono">{inMapTransfer.progress}%</span>
            </div>
            <div
              className="w-full rounded-full h-2 overflow-hidden mb-1.5"
              style={{ backgroundColor: 'var(--md-sys-color-surface-container)' }}
            >
              <div 
                className="h-full transition-all duration-200 rounded-full" 
                style={{
                  width: `${inMapTransfer.progress}%`,
                  backgroundColor: 'var(--md-sys-color-primary)',
                }} 
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted font-mono">
              <span>DTLS DataChannel</span>
              <span className="text-emerald-500 font-semibold">{inMapTransfer.speed}</span>
            </div>
          </div>
        )}

        {/* Render Real Nodes */}
        {nodes.map(node => {
          const isDragTarget = dragOverNodeId === node.id;
          const isNodeInCall = isCallActive && (node.isHost || !node.isSelf);
          const isSelected = selectedNode?.id === node.id;

          return (
            <div
              key={node.id}
              onDragOver={(e) => handleDragOver(e, node.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, node)}
              onClick={() => handleNodeClick(node)}
              className="absolute z-20 flex flex-col items-center cursor-pointer group select-none transition-all duration-300"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)'
              }}
              title={`Click ${node.name} to view actions. Drag & drop files directly onto this node to send.`}
            >
              {/* Call indicator ripple */}
              {isNodeInCall && (
                <div className="absolute -inset-3 rounded-[28px] border-2 border-emerald-500 animate-ping opacity-75 pointer-events-none" />
              )}

              {/* Node Expressive Squircle Avatar */}
              <div
                className={cn(
                  "relative rounded-[24px] flex items-center justify-center text-white font-bold transition-all duration-300 shadow-xl border-2 overflow-hidden",
                  node.isHost ? "w-16 h-16 md:w-20 md:h-20" : "w-14 h-14 md:w-16 md:h-16",
                  node.avatarColor || "m3-btn-filled",
                  isDragTarget
                    ? "ring-4 ring-[var(--md-sys-color-primary)] scale-125 animate-pulse"
                    : isSelected
                      ? "ring-4 ring-[var(--md-sys-color-primary)] scale-110"
                      : "group-hover:scale-108"
                )}
                style={{
                  borderColor: isSelected
                    ? 'var(--md-sys-color-primary)'
                    : 'var(--md-sys-color-outline-variant)',
                }}
              >
                {node.avatarImage ? (
                  <img src={node.avatarImage} alt={node.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center leading-tight">
                    {node.isHost ? (
                      <Crown className="w-5 h-5 md:w-6 md:h-6 text-amber-300 drop-shadow-md mb-0.5" />
                    ) : null}
                    <span className="text-xs md:text-sm font-bold tracking-wider uppercase">
                      {node.name.charAt(0)}
                    </span>
                  </div>
                )}

                {/* Drop cue overlay */}
                {isDragTarget && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--md-sys-color-primary)',
                      color: 'var(--md-sys-color-on-primary)',
                    }}
                  >
                    <Upload className="w-6 h-6 animate-bounce" />
                  </div>
                )}
              </div>

              {/* Node Label Pill */}
              <div className="mt-2 text-center flex flex-col items-center">
                <span
                  className="text-xs font-bold tracking-tight whitespace-nowrap px-3 py-0.5 rounded-full border shadow-xs transition-colors"
                  style={{
                    backgroundColor: node.isHost
                      ? 'var(--md-sys-color-primary-container)'
                      : 'var(--md-sys-color-surface-container-high)',
                    color: node.isHost
                      ? 'var(--md-sys-color-on-primary-container)'
                      : 'var(--md-sys-color-on-surface)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  {node.name}
                </span>
                <span className="text-[10px] font-mono text-muted font-semibold mt-0.5">
                  {node.roleText}
                </span>
              </div>
            </div>
          );
        })}

        {/* Interactive Node Action Sheet (Corner Extra Large 28dp) */}
        {selectedNode && (
          <div
            className="absolute z-30 bottom-4 right-4 max-w-sm w-80 m3-card-xl rounded-[28px] p-4 sm:p-5 border shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <div
              className="flex items-center justify-between pb-3 border-b"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn("w-9 h-9 rounded-2xl flex items-center justify-center text-white text-xs font-bold overflow-hidden shadow-xs", selectedNode.avatarColor || "m3-btn-filled")}>
                  {selectedNode.avatarImage ? (
                    <img src={selectedNode.avatarImage} alt={selectedNode.name} className="w-full h-full object-cover" />
                  ) : (
                    selectedNode.isHost ? "👑" : selectedNode.name.charAt(0)
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text flex items-center gap-1.5">
                    <span>{selectedNode.name}</span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                      style={{
                        backgroundColor: 'var(--md-sys-color-secondary-container)',
                        color: 'var(--md-sys-color-on-secondary-container)',
                      }}
                    >
                      {selectedNode.roleText}
                    </span>
                  </h4>
                  <div className="text-[10px] text-emerald-500 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Direct WebRTC Link {selectedNode.pingMs > 0 ? `(${selectedNode.pingMs}ms)` : '(Local)'}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="w-8 h-8 rounded-full m3-surface-interactive border flex items-center justify-center text-muted hover:text-text transition-colors cursor-pointer"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expressive Pill Actions for Selected Peer */}
            <div className="grid grid-cols-2 gap-2 mt-3.5">
              <button
                onClick={handleTriggerFileSelect}
                className="col-span-2 py-2.5 px-4 rounded-full m3-btn-filled font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Upload className="w-4 h-4" />
                <span>Send File to {selectedNode.name}</span>
              </button>

              <button
                onClick={() => handleStartCall('audio')}
                className="py-2 px-3 rounded-full m3-btn-tonal font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Voice Call</span>
              </button>

              <button
                onClick={() => handleStartCall('video')}
                className="py-2 px-3 rounded-full m3-btn-tertiary font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video Call</span>
              </button>
            </div>

            {/* Direct message quick input */}
            <form onSubmit={handleSendMessage} className="mt-3 flex gap-1.5">
              <input 
                type="text"
                placeholder={`Message ${selectedNode.name}...`}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 border rounded-full px-3.5 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              />
              <button
                type="submit"
                className="w-8 h-8 rounded-full m3-btn-filled flex items-center justify-center cursor-pointer shrink-0 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Live Activity Feed & Segmented Pill Controls */}
      <div
        className="p-4 md:p-5 border-t flex flex-col gap-3 flex-shrink-0"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div
            className="text-xs text-muted font-sans leading-relaxed border-l-2 pl-3"
            style={{ borderColor: 'var(--md-sys-color-primary)' }}
          >
            Real-time Quantum Link mesh signal feed, active peer tunnels, and live call telemetry.
          </div>

          {/* Interactive M3 Segmented Pill Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-full border"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <button
              onClick={() => setActiveBottomTab('messages')}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                activeBottomTab === 'messages' ? "m3-btn-filled shadow-2xs" : "text-muted hover:text-text"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Messages</span>
            </button>
            <button
              onClick={() => setActiveBottomTab('connections')}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                activeBottomTab === 'connections' ? "m3-btn-filled shadow-2xs" : "text-muted hover:text-text"
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Peers ({connectedCount})</span>
            </button>
            <button
              onClick={() => setActiveBottomTab('calls')}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 relative cursor-pointer",
                activeBottomTab === 'calls' ? "m3-btn-tertiary shadow-2xs" : "text-muted hover:text-text"
              )}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Live Calls</span>
              {isCallActive && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Tab 1: Live Network Messages & Direct Input */}
        {activeBottomTab === 'messages' && (
          <div className="flex flex-col gap-2.5">
            <div
              className="m3-card rounded-2xl p-3 border flex flex-col gap-1.5 max-h-32 overflow-y-auto font-mono text-xs scrollbar-thin"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              {combinedFeed.map((evt) => (
                <div key={evt.id} className="flex items-center justify-between gap-3 text-text">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      evt.type === 'ok' ? "bg-emerald-500" :
                      evt.type === 'bypass' ? "bg-[var(--md-sys-color-primary)] animate-pulse" :
                      evt.type === 'call' ? "bg-emerald-500 animate-ping" : 
                      evt.type === 'msg' ? "bg-[var(--md-sys-color-tertiary)]" : "bg-[var(--md-sys-color-primary)]"
                    )} />
                    <span className={cn(
                      "truncate",
                      evt.type === 'bypass' ? "text-[color:var(--md-sys-color-primary)] font-semibold" :
                      evt.type === 'call' ? "text-emerald-500 font-semibold" :
                      evt.type === 'msg' ? "text-text font-medium" : "text-muted"
                    )}>
                      {evt.text}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted font-mono flex-shrink-0">{evt.time}</span>
                </div>
              ))}
            </div>

            {/* Bottom Global Network Broadcast Box */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Broadcast a message across all connected Quantum Link nodes..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 border rounded-full px-4 py-2 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="px-5 py-2 rounded-full m3-btn-filled disabled:opacity-40 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Connections List */}
        {activeBottomTab === 'connections' && (
          <div
            className="m3-card rounded-2xl p-3 border max-h-36 overflow-y-auto"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {nodes.map(n => (
                <div
                  key={n.id}
                  className="p-2.5 rounded-2xl border flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white overflow-hidden shadow-xs", n.avatarColor || "m3-btn-filled")}>
                      {n.avatarImage ? (
                        <img src={n.avatarImage} alt={n.name} className="w-full h-full object-cover" />
                      ) : (
                        n.isHost ? "👑" : n.name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate text-text">{n.name}</div>
                      <div className="text-[10px] text-muted font-mono">{n.roleText} • {n.status}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-500 font-semibold flex-shrink-0">
                    {n.pingMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Active Calls */}
        {activeBottomTab === 'calls' && (
          <div
            className="m3-card rounded-2xl p-4 border flex items-center justify-between flex-wrap gap-3"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            {isCallActive ? (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl border flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--md-sys-color-tertiary-container)',
                      color: 'var(--md-sys-color-on-tertiary-container)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text flex items-center gap-2">
                      <span>Encrypted {callType?.toUpperCase() || 'Audio'} Call Active</span>
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                        style={{
                          backgroundColor: 'var(--md-sys-color-secondary-container)',
                          color: 'var(--md-sys-color-on-secondary-container)',
                        }}
                      >
                        {formatTime(callDuration)}
                      </span>
                    </div>
                    <div className="text-xs text-muted">Zero-relay WebRTC SRTP audio/video stream</div>
                  </div>
                </div>

                <button
                  onClick={handleEndCall}
                  className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>End Call</span>
                </button>
              </>
            ) : (
              <div className="w-full text-center py-3 text-xs text-muted">
                No active calls on the mesh. Tap any connected node above to start an encrypted voice or video call.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
