import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Crown, 
  Activity, 
  RefreshCw, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Server, 
  Wifi, 
  ArrowRight, 
  Clock, 
  Users, 
  Fingerprint,
  Radio,
  Lock,
  FlaskConical,
  WifiOff,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { NexusPeer, sortPeersDeterministically, hasMajorityQuorum } from '../lib/nexusFailover';
import { NexusNetworkNode } from '../lib/NexusNetworkNode';

interface NexusFailoverHUDProps {
  localUsername: string;
  localAvatarColor: string;
  localAvatarImage?: string;
  localPeerId: string;
  realConnectedCount?: number;
  peerProfiles?: Record<string, { id: string; username: string; avatarColor: string; avatarImage?: string; bio?: string; joinedAt?: string }>;
  role?: 'host' | 'join' | null;
  networkStatus?: 'offline' | 'disconnected' | 'handshaking' | 'connected';
  activeNode?: NexusNetworkNode | null;
  isSimulation?: boolean;
  onToggleSimulation?: () => void;
  onNavigateToConnect?: () => void;
  onClose?: () => void;
  onTransferHostControl?: (peerId: string) => void;
  onGracefulHostDrop?: () => void;
  onNetworkSplit?: () => void;
}

export function NexusFailoverHUD({
  localUsername,
  localAvatarColor,
  localAvatarImage,
  localPeerId,
  realConnectedCount = 0,
  peerProfiles = {},
  role = null,
  networkStatus = 'disconnected',
  activeNode,
  isSimulation = false,
  onToggleSimulation,
  onNavigateToConnect,
  onClose,
  onTransferHostControl,
  onGracefulHostDrop,
  onNetworkSplit,
}: NexusFailoverHUDProps) {
  const [internalSimMode, setInternalSimMode] = useState<boolean>(isSimulation);

  useEffect(() => {
    if (isSimulation !== undefined) {
      setInternalSimMode(isSimulation);
    }
  }, [isSimulation]);

  const isSimActive = isSimulation !== undefined ? isSimulation : internalSimMode;

  const handleToggleSim = () => {
    if (onToggleSimulation) {
      onToggleSimulation();
    } else {
      setInternalSimMode(prev => !prev);
    }
  };

  // Factory functions for peers
  const createSimulatedPeers = (): NexusPeer[] => [
    {
      peerId: 'sim_host_01',
      joinOrder: 1,
      joinTimestamp: Date.now() - 120000,
      endpoint: '10.0.0.1:8080 (Sim)',
      status: 'active',
      role: 'host',
      username: '[Sim] Host Node (Leader)',
      avatarColor: 'bg-accent',
      lastHeartbeat: Date.now(),
      latencyMs: 8,
      missedHeartbeats: 0,
    },
    {
      peerId: 'sim_peer_02',
      joinOrder: 2,
      joinTimestamp: Date.now() - 85000,
      endpoint: '10.0.0.2:8081 (Sim)',
      status: 'active',
      role: 'peer',
      username: '[Sim] Beta (1st Joiner)',
      avatarColor: 'bg-blue-500',
      lastHeartbeat: Date.now(),
      latencyMs: 14,
      missedHeartbeats: 0,
    },
    {
      peerId: localPeerId || 'local_user_03',
      joinOrder: 3,
      joinTimestamp: Date.now() - 45000,
      endpoint: '10.0.0.3:8082 (Sim)',
      status: 'active',
      role: 'peer',
      username: localUsername ? `${localUsername}` : 'You (Local Node)',
      avatarColor: localAvatarColor || 'bg-emerald-500',
      lastHeartbeat: Date.now(),
      latencyMs: 12,
      missedHeartbeats: 0,
    },
    {
      peerId: 'sim_peer_04',
      joinOrder: 4,
      joinTimestamp: Date.now() - 15000,
      endpoint: '10.0.0.4:8083 (Sim)',
      status: 'active',
      role: 'peer',
      username: '[Sim] Gamma (3rd Joiner)',
      avatarColor: 'bg-purple-500',
      lastHeartbeat: Date.now(),
      latencyMs: 22,
      missedHeartbeats: 0,
    },
  ];

  const createLivePeers = (): NexusPeer[] => {
    const isHost = role === 'host';
    const myId = localPeerId || 'local_node';
    const myName = localUsername || 'You (Local Node)';
    const myColor = localAvatarColor || 'bg-accent';

    const myPeer: NexusPeer = {
      peerId: myId,
      joinOrder: isHost ? 1 : 2,
      joinTimestamp: Date.now(),
      endpoint: 'Local Loopback (WebRTC)',
      status: 'active',
      role: isHost ? 'host' : 'peer',
      username: myName,
      avatarColor: myColor,
      avatarImage: localAvatarImage,
      lastHeartbeat: Date.now(),
      latencyMs: 1,
      missedHeartbeats: 0,
    };

    const remoteEntries = Object.entries(peerProfiles || {});
    const isConnected = realConnectedCount > 0 && remoteEntries.length > 0;

    if (!isConnected) {
      // STRICT REQUIREMENT: When not connected to anyone, REMOVE ALL FAKE NAMES!
      // Only the real local user node is shown.
      return [
        {
          ...myPeer,
          joinOrder: 1,
          role: isHost ? 'host' : 'peer',
        }
      ];
    }

    // Connected to real peers via WebRTC! Real names only.
    const remotes: NexusPeer[] = remoteEntries.map(([id, p], idx) => {
      const isRemoteHost = !isHost && idx === 0;
      return {
        peerId: p.id || id,
        joinOrder: isHost ? idx + 2 : (isRemoteHost ? 1 : idx + 2),
        joinTimestamp: p.joinedAt ? new Date(p.joinedAt).getTime() : Date.now() - (idx + 1) * 30000,
        endpoint: `P2P Direct [${(p.id || id).substring(0, 6)}]`,
        status: 'active',
        role: isRemoteHost ? 'host' : 'peer',
        username: p.username || `Peer-${id.substring(0, 4)}`,
        avatarColor: p.avatarColor || 'bg-blue-500',
        avatarImage: p.avatarImage,
        lastHeartbeat: Date.now(),
        latencyMs: 8 + (idx * 3),
        missedHeartbeats: 0,
      };
    });

    return sortPeersDeterministically([myPeer, ...remotes]);
  };

  // Cluster state
  const [term, setTerm] = useState(1);
  const [currentHostId, setCurrentHostId] = useState<string>(localPeerId || 'local_node');
  const [localRole, setLocalRole] = useState<'host' | 'peer' | 're-routing'>('peer');
  const [logs, setLogs] = useState<{ id: string; text: string; type: 'info' | 'ok' | 'err' | 'warn'; time: string }[]>([]);
  const [heartbeatBeat, setHeartbeatBeat] = useState(false);
  const [peers, setPeers] = useState<NexusPeer[]>(() => isSimulation ? createSimulatedPeers() : createLivePeers());
  const [activeAcks, setActiveAcks] = useState<number>(4);
  const [isElecting, setIsElecting] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addHUDLog = (text: string, type: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev.slice(-30), { id: Math.random().toString(36).substring(2), text, type, time }]);
  };

  // Sync cluster peers with simulation state or live connection changes
  const prevSimRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isSimActive) {
      const simPeers = createSimulatedPeers();
      setPeers(simPeers);
      setCurrentHostId('sim_host_01');
      setLocalRole('peer');
      setTerm(1);
      setActiveAcks(simPeers.length);
      if (prevSimRef.current !== true) {
        addHUDLog("Loaded sandboxed 4-node simulation cluster. Failover testing enabled.", "info");
        prevSimRef.current = true;
      }
    } else {
      const live = createLivePeers();
      setPeers(live);
      const isHost = role === 'host';
      const hostPeer = live.find(p => p.role === 'host') || live[0];
      setCurrentHostId(hostPeer ? hostPeer.peerId : (localPeerId || 'local_node'));
      setLocalRole(isHost ? 'host' : 'peer');
      setTerm(1);
      setActiveAcks(live.length);
      if (prevSimRef.current !== false) {
        if (live.length === 1) {
          addHUDLog(`Standalone mode: [${localUsername || 'Local User'}] is active. Zero remote peers connected.`, "info");
        } else {
          addHUDLog(`Synchronized live mesh with ${live.length} real peers.`, "ok");
        }
        prevSimRef.current = false;
      }
    }
  }, [isSimActive, realConnectedCount, JSON.stringify(peerProfiles), role]);

  // Heartbeat pulse effect
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatBeat(true);
      setTimeout(() => setHeartbeatBeat(false), 400);

      // Random jitter on latency for connected nodes
      setPeers(prev => prev.map(p => {
        if (p.status === 'disconnected') return p;
        if (p.latencyMs === 1 || p.latencyMs === 0) return p; // local node
        return {
          ...p,
          lastHeartbeat: Date.now(),
          latencyMs: Math.max(4, p.latencyMs + Math.floor((Math.random() - 0.5) * 4))
        };
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Initial log
  useEffect(() => {
    addHUDLog("Nexus P2P Engine online. Deterministic Join-Order Monotonic Registry active.", "ok");
    addHUDLog("Heartbeat Watchdog: ping/pong interval 2000ms | timeout threshold 5000ms.", "info");
    addHUDLog("Leader Election Rule: sort (joinOrder ASC, joinTimestamp ASC, hash(peerId)). First joiner is primary heir.", "info");
  }, []);

  // Compute surviving peers and next in line
  const survivingPeers = peers.filter(p => p.status !== 'disconnected' && p.peerId !== currentHostId);
  const sortedSurviving = sortPeersDeterministically(survivingPeers);
  const nextInLine = sortedSurviving.length > 0 ? sortedSurviving[0] : null;

  const totalActivePeers = peers.filter(p => p.status !== 'disconnected').length;
  const quorumMet = hasMajorityQuorum(activeAcks, totalActivePeers);
  const isConnectedToRealPeers = !isSimActive && realConnectedCount > 0 && Object.keys(peerProfiles || {}).length > 0;
  const isStandalone = !isSimActive && !isConnectedToRealPeers;

  // --- Simulation Actions (Only in Simulation Mode) ---

  const handleSimulateAbruptHostDrop = () => {
    setIsElecting(true);
    addHUDLog(`🚨 ALERT: Heartbeat lost from current host [${currentHostId}]!`, "err");
    
    setPeers(prev => prev.map(p => p.peerId === currentHostId ? { ...p, status: 'disconnected', role: 'peer' } : p));
    setLocalRole('re-routing');

    setTimeout(() => {
      addHUDLog("Heartbeat watchdog timed out (5000ms threshold). Triggering deterministic election check on all peers...", "warn");
      
      const surviving = peers.filter(p => p.peerId !== currentHostId && p.status !== 'disconnected');
      const ranked = sortPeersDeterministically(surviving);
      const winner = ranked[0];

      if (!winner) {
        addHUDLog("No surviving nodes available in partition.", "err");
        setIsElecting(false);
        return;
      }

      addHUDLog(`Deterministic sorting complete: [${winner.username}] has lowest joinOrder (#${winner.joinOrder}) and earliest timestamp.`, "ok");
      addHUDLog(`👑 [${winner.username}] promotes itself to NEW HOST! Term increments to ${term + 1}.`, "ok");
      addHUDLog(`Broadcasting signed HOST_CLAIM (Term ${term + 1}, Signature: SIG_${Math.random().toString(16).substring(2, 10).toUpperCase()})...`, "info");

      setTimeout(() => {
        const nextTerm = term + 1;
        setTerm(nextTerm);
        setCurrentHostId(winner.peerId);
        setLocalRole(winner.peerId === (localPeerId || 'local_user_03') ? 'host' : 'peer');

        setPeers(prev => prev.map(p => {
          if (p.peerId === winner.peerId) {
            return { ...p, role: 'host', status: 'active' };
          }
          if (p.status !== 'disconnected') {
            return { ...p, role: 'peer' };
          }
          return p;
        }));

        const survivingCount = surviving.length;
        setActiveAcks(survivingCount);
        setIsElecting(false);

        addHUDLog(`✅ Quorum Acknowledged: ${survivingCount}/${survivingCount} surviving peers sent HOST_CLAIM_ACK. Session state resumed.`, "ok");
      }, 1200);
    }, 1000);
  };

  const handleSimulateGracefulHandoff = () => {
    if (!nextInLine) {
      addHUDLog("No eligible peer for handoff.", "warn");
      return;
    }

    addHUDLog(`Host [${currentHostId}] initiated graceful HOST_HANDOFF to [${nextInLine.username}].`, "info");
    addHUDLog("Packaging state snapshot (sequenceNum, transfers, message state) into handover packet...", "info");

    setTimeout(() => {
      const nextTerm = term + 1;
      setTerm(nextTerm);
      const oldHost = currentHostId;
      setCurrentHostId(nextInLine.peerId);
      setLocalRole(nextInLine.peerId === (localPeerId || 'local_user_03') ? 'host' : 'peer');

      setPeers(prev => prev.map(p => {
        if (p.peerId === nextInLine.peerId) return { ...p, role: 'host', status: 'active' };
        if (p.peerId === oldHost) return { ...p, role: 'peer', status: 'active' };
        return p;
      }));

      addHUDLog(`🔄 Handoff Successful! [${nextInLine.username}] is the new Host. Term ${nextTerm}. Zero dropped packets.`, "ok");
    }, 800);
  };

  const handleSimulateSimultaneousDrop = () => {
    setIsElecting(true);
    addHUDLog("⚠️ CRITICAL FAILURE: Simultaneous disconnect! Current Host AND First-Joiner crashed simultaneously!", "err");

    const heir = nextInLine;
    const secondHeir = sortedSurviving.length > 1 ? sortedSurviving[1] : null;

    setPeers(prev => prev.map(p => {
      if (p.peerId === currentHostId || (heir && p.peerId === heir.peerId)) {
        return { ...p, status: 'disconnected', role: 'peer' };
      }
      return p;
    }));
    setLocalRole('re-routing');

    setTimeout(() => {
      addHUDLog(`First candidate [${heir?.username || 'Heir'}] failed to broadcast HOST_CLAIM within election timeout (4000ms). Marking unresponsive...`, "warn");

      if (!secondHeir) {
        addHUDLog("Cluster partitioned: No secondary heirs available.", "err");
        setIsElecting(false);
        return;
      }

      addHUDLog(`Fallback Algorithm engaged: Re-evaluating sorted table... Next candidate is 2nd Joiner [${secondHeir.username}].`, "ok");
      addHUDLog(`👑 [${secondHeir.username}] promotes to NEW HOST! Term ${term + 1}.`, "ok");

      setTimeout(() => {
        const nextTerm = term + 1;
        setTerm(nextTerm);
        setCurrentHostId(secondHeir.peerId);
        setLocalRole(secondHeir.peerId === (localPeerId || 'local_user_03') ? 'host' : 'peer');

        setPeers(prev => prev.map(p => {
          if (p.peerId === secondHeir.peerId) return { ...p, role: 'host', status: 'active' };
          return p;
        }));

        const survivingNow = peers.filter(p => p.status !== 'disconnected' && p.peerId !== currentHostId && p.peerId !== heir?.peerId);
        setActiveAcks(survivingNow.length);
        setIsElecting(false);

        addHUDLog(`✅ 2nd Joiner established consensus. Quorum preserved without network split.`, "ok");
      }, 1000);
    }, 1200);
  };

  const handleSimulatePartition = () => {
    addHUDLog("🌐 Simulating Network Partition: Cluster split into 2-node subnets.", "warn");
    
    setPeers(prev => prev.map((p, idx) => {
      if (idx >= 2) return { ...p, status: 'disconnected' };
      return p;
    }));

    setActiveAcks(2);

    setTimeout(() => {
      addHUDLog("Split-Brain Guard Active: Partition has 2/4 surviving nodes. Quorum requirement (> 50%) = 3 nodes.", "err");
      addHUDLog("⏸️ Commits PAUSED on minority partition to prevent split-brain state divergence. Awaiting network heal.", "warn");
    }, 600);
  };

  const handleResetTopology = () => {
    setIsElecting(false);
    if (isSimActive) {
      const sim = createSimulatedPeers();
      setTerm(1);
      setCurrentHostId('sim_host_01');
      setLocalRole('peer');
      setActiveAcks(sim.length);
      setPeers(sim);
      addHUDLog("Topology reset to initial 4-node simulated Nexus cluster.", "info");
    } else {
      const live = createLivePeers();
      setPeers(live);
      const isHost = role === 'host';
      const hostPeer = live.find(p => p.role === 'host') || live[0];
      setCurrentHostId(hostPeer ? hostPeer.peerId : (localPeerId || 'local_node'));
      setLocalRole(isHost ? 'host' : 'peer');
      setTerm(1);
      setActiveAcks(live.length);
      addHUDLog("Live topology refreshed to current connected peer state.", "info");
    }
  };

  const currentHostPeer = peers.find(p => p.peerId === currentHostId) || peers.find(p => p.role === 'host') || peers[0];

  return (
    <div
      className="w-full h-full flex flex-col gap-3.5 sm:gap-4 lg:gap-5 overflow-y-auto p-3.5 sm:p-5 lg:p-6 pb-24 lg:pb-8 scrollbar-hide text-text"
      style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
    >
      {/* Simulation Mode Toggle Banner */}
      <div
        className="m3-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl border shadow-2xs flex-shrink-0"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full flex-shrink-0",
            isSimActive ? "bg-[var(--md-sys-color-primary)] animate-ping" : isConnectedToRealPeers ? "bg-emerald-500" : "bg-amber-500"
          )} />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold tracking-tight text-text truncate">
              {isSimActive ? "Quantum Link Mesh Simulation Active" : isConnectedToRealPeers ? "Quantum Link Mesh Connected" : "Quantum Link Standalone Node"}
            </span>
            <span
              className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-semibold uppercase flex-shrink-0"
              style={{
                backgroundColor: isSimActive
                  ? 'var(--md-sys-color-primary-container)'
                  : isConnectedToRealPeers
                    ? 'var(--md-sys-color-tertiary-container)'
                    : 'var(--md-sys-color-secondary-container)',
                color: isSimActive
                  ? 'var(--md-sys-color-on-primary-container)'
                  : isConnectedToRealPeers
                    ? 'var(--md-sys-color-on-tertiary-container)'
                    : 'var(--md-sys-color-on-secondary-container)',
              }}
            >
              {isSimActive ? "Sandboxed" : isConnectedToRealPeers ? "Live Mesh" : "0 Peers"}
            </span>
          </div>
          <span className="text-[11px] text-muted hidden md:inline font-mono truncate">
            {isSimActive 
              ? "• Failure injection & election triggers enabled" 
              : isConnectedToRealPeers
                ? `• Connected to ${realConnectedCount} real peer${realConnectedCount === 1 ? '' : 's'} via WebRTC`
                : "• Deterministic WebRTC watchdog standing by"}
          </span>
        </div>

        <button
          onClick={handleToggleSim}
          className={cn(
            "px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs flex-shrink-0 active:scale-95",
            isSimActive ? "m3-btn-filled" : "m3-btn-tonal"
          )}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>{isSimActive ? "Exit Simulation" : "Simulation Sandbox"}</span>
        </button>
      </div>

      {/* Top Telemetry Strip (Responsive 2x2 grid in portrait, 4 cols in landscape) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 flex-shrink-0">
        
        {/* Card 1: Current Host Node */}
        <div
          className="m3-card p-3 sm:p-4 rounded-2xl flex items-center gap-3 border shadow-2xs relative overflow-hidden"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <Crown className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span className="truncate">Mesh Leader</span>
              <span
                className="text-[9px] px-1.5 py-0.2 rounded-full font-bold"
                style={{
                  backgroundColor: 'var(--md-sys-color-secondary-container)',
                  color: 'var(--md-sys-color-on-secondary-container)',
                }}
              >
                T{term}
              </span>
            </div>
            <div className="text-xs sm:text-sm font-bold truncate text-text mt-0.5">
              {isStandalone 
                ? (role === 'host' ? `${localUsername || 'You'} (Host)` : 'Standalone') 
                : (currentHostPeer?.username || 'Electing...')}
            </div>
            <div className="text-[9px] sm:text-[10px] font-mono text-muted truncate">
              {isStandalone ? 'Local Node' : `ID: ${currentHostId.substring(0, 10)}`}
            </div>
          </div>
        </div>

        {/* Card 2: Quorum Status */}
        <div
          className="m3-card p-3 sm:p-4 rounded-2xl flex items-center gap-3 border shadow-2xs"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border"
            style={{
              backgroundColor: quorumMet
                ? 'var(--md-sys-color-tertiary-container)'
                : 'rgba(239, 68, 68, 0.14)',
              color: quorumMet
                ? 'var(--md-sys-color-on-tertiary-container)'
                : '#ef4444',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider truncate">
              Quorum (&gt;50%)
            </div>
            <div className={cn("text-xs sm:text-sm font-bold mt-0.5 truncate", quorumMet ? "text-emerald-500" : "text-rose-500")}>
              {isStandalone ? "Standalone" : quorumMet ? "Consensus Valid" : "Guarded"}
            </div>
            <div className="text-[9px] sm:text-[10px] font-mono text-muted truncate">
              {isStandalone ? "0 peers connected" : `${activeAcks}/${totalActivePeers} nodes acked`}
            </div>
          </div>
        </div>

        {/* Card 3: Local Node Role */}
        <div
          className="m3-card p-3 sm:p-4 rounded-2xl flex items-center gap-3 border shadow-2xs"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border"
            style={{
              backgroundColor: 'var(--md-sys-color-secondary-container)',
              color: 'var(--md-sys-color-on-secondary-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <Server className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider truncate">
              Local Role
            </div>
            <div className="text-xs sm:text-sm font-bold uppercase tracking-tight mt-0.5 truncate text-text">
              {isStandalone ? (role === 'host' ? 'HOST' : role === 'join' ? 'PEER' : 'STANDALONE') : localRole}
            </div>
            <div className="text-[9px] sm:text-[10px] font-mono text-muted truncate">
              {role === 'host' ? "Authoritative state" : role === 'join' ? "Tunnel client" : "Awaiting connect"}
            </div>
          </div>
        </div>

        {/* Card 4: Heartbeat Pulse */}
        <div
          className="m3-card p-3 sm:p-4 rounded-2xl flex items-center gap-3 border shadow-2xs"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div
            className={cn(
              "w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-transform duration-200",
              heartbeatBeat && "scale-108"
            )}
            style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span className="truncate">Heartbeat</span>
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", heartbeatBeat ? "bg-emerald-500" : "bg-muted/40")} />
            </div>
            <div className="text-xs sm:text-sm font-bold mt-0.5 truncate text-text">
              Every 2.0s
            </div>
            <div className="text-[9px] sm:text-[10px] font-mono text-muted truncate">
              Watchdog: 5.0s
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Grid: Synchronized Peer Table & Simulator/Locked Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 flex-1 min-h-0">
        
        {/* Left Column: Synchronized Peer Table */}
        <div
          className="lg:col-span-8 flex flex-col m3-card-xl rounded-[28px] p-4 sm:p-5 border shadow-xs"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3.5 sm:pb-4 border-b"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold tracking-tight text-text flex items-center gap-2">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[color:var(--md-sys-color-primary)] flex-shrink-0" />
                  <span>Synchronized Quantum Link Registry</span>
                </h3>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  {peers.length} {peers.length === 1 ? 'Node' : 'Nodes'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted mt-0.5">
                {isSimActive 
                  ? "Sandboxed simulation registry. Earliest joiner is designated failover heir." 
                  : isConnectedToRealPeers
                    ? "Live active WebRTC mesh with deterministic join-order succession."
                    : "Standalone node. Connect peers to establish automatic failover redundancy."}
              </p>
            </div>
            
            <div
              className="flex items-center gap-2 text-[11px] sm:text-xs font-mono px-3 py-1.5 rounded-full border self-start sm:self-auto flex-shrink-0"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <Clock className="w-3.5 h-3.5 text-[color:var(--md-sys-color-primary)] flex-shrink-0" />
              <span>Heir: <strong className="text-[color:var(--md-sys-color-primary)]">{isStandalone ? 'None (0 peers)' : (nextInLine?.username || 'None')}</strong></span>
            </div>
          </div>

          {/* Mobile Portrait Peer Cards View */}
          <div className="block sm:hidden space-y-2.5 mt-3.5">
            {peers.map((peer) => {
              const isHost = peer.role === 'host';
              const isLocal = peer.peerId === (localPeerId || 'local_node') || peer.peerId === 'local_user_03';
              const isNext = nextInLine?.peerId === peer.peerId;
              const isDead = peer.status === 'disconnected';

              return (
                <div 
                  key={`mobile-${peer.peerId}`}
                  className={cn(
                    "m3-card p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5",
                    isDead && "opacity-55"
                  )}
                  style={{
                    backgroundColor: isHost
                      ? 'var(--md-sys-color-primary-container)'
                      : isNext
                        ? 'var(--md-sys-color-secondary-container)'
                        : 'var(--md-sys-color-surface-container-low)',
                    color: isHost
                      ? 'var(--md-sys-color-on-primary-container)'
                      : isNext
                        ? 'var(--md-sys-color-on-secondary-container)'
                        : 'var(--md-sys-color-on-surface)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex-shrink-0"
                        style={{
                          backgroundColor: isHost
                            ? 'var(--md-sys-color-primary)'
                            : 'var(--md-sys-color-surface-container-high)',
                          color: isHost
                            ? 'var(--md-sys-color-on-primary)'
                            : 'var(--md-sys-color-on-surface)',
                        }}
                      >
                        #{peer.joinOrder}
                      </span>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0 overflow-hidden", peer.avatarColor || "m3-btn-filled")}>
                        {peer.avatarImage ? (
                           <img src={peer.avatarImage} alt={peer.username} className="w-full h-full object-cover" />
                        ) : (
                          peer.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold truncate flex items-center gap-1.5 text-xs">
                          <span className="truncate">{peer.username}</span>
                          {isLocal && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-500 font-bold px-1.5 py-0.2 rounded-full flex-shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] font-mono opacity-75 truncate">
                          ID: {peer.peerId.substring(0, 10)}
                        </div>
                      </div>
                    </div>

                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0",
                      isDead 
                        ? "bg-rose-500/20 text-rose-500" 
                        : isStandalone
                          ? "bg-amber-500/20 text-amber-500"
                          : "bg-emerald-500/20 text-emerald-500"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isDead ? "bg-rose-500" : isStandalone ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                      )} />
                      {isDead ? "DEAD" : isStandalone ? "STANDALONE" : "ONLINE"}
                    </span>
                  </div>

                  <div
                    className="grid grid-cols-2 gap-2 pt-2 border-t text-[10px] font-mono"
                    style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-70">Role:</span>
                      {isHost ? (
                        <span className="inline-flex items-center gap-1 font-bold">
                          <Crown className="w-3 h-3" /> HOST
                        </span>
                      ) : (
                        <span className="font-medium">PEER</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="opacity-70">Rank:</span>
                      {isDead ? (
                        <span>—</span>
                      ) : isHost ? (
                        <span className="font-semibold">{isStandalone ? "Standalone" : "Leader"}</span>
                      ) : isNext ? (
                        <span className="font-bold flex items-center gap-0.5">
                          <Zap className="w-3 h-3" /> 1st Heir
                        </span>
                      ) : (
                        <span>Rank #{peer.joinOrder}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 col-span-2 justify-between">
                      <span className="opacity-75 truncate max-w-[200px]">{peer.endpoint}</span>
                      <span className="font-bold flex-shrink-0">
                        {isDead ? "TIMEOUT" : `${peer.latencyMs}ms`}
                      </span>
                    </div>
                  </div>

                  {role === 'host' && !isHost && !isDead && (
                    <button
                      onClick={() => {
                        if (onTransferHostControl) {
                          onTransferHostControl(peer.peerId);
                        } else {
                          handleSimulateGracefulHandoff();
                        }
                      }}
                      className="w-full mt-1 py-2 px-3 rounded-full m3-btn-filled font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98]"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      <span>Transfer Host Authority to {peer.username}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop/Tablet Peer Table */}
          <div className="hidden sm:block w-full overflow-x-auto mt-3 scrollbar-hide">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap sm:whitespace-normal">
              <thead>
                <tr
                  className="border-b text-muted font-mono uppercase text-[10px] tracking-wider"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  <th className="py-2.5 px-3 text-center sm:text-left">Seq #</th>
                  <th className="py-2.5 px-3">Node Identity</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Endpoint</th>
                  <th className="py-2.5 px-3 hidden sm:table-cell">Latency</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3 hidden sm:table-cell">Failover Rank</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  {role === 'host' && (
                    <th className="py-2.5 px-3 text-right">Host Control</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {peers.map((peer) => {
                  const isHost = peer.role === 'host';
                  const isLocal = peer.peerId === (localPeerId || 'local_node') || peer.peerId === 'local_user_03';
                  const isNext = nextInLine?.peerId === peer.peerId;
                  const isDead = peer.status === 'disconnected';

                  return (
                    <tr 
                      key={peer.peerId}
                      className={cn(
                        "transition-colors",
                        isDead ? "opacity-45" : "hover:bg-black/5 dark:hover:bg-white/5"
                      )}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-center sm:text-left">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs"
                          style={{
                            backgroundColor: isHost
                              ? 'var(--md-sys-color-primary)'
                              : 'var(--md-sys-color-surface-container-high)',
                            color: isHost
                              ? 'var(--md-sys-color-on-primary)'
                              : 'var(--md-sys-color-on-surface)',
                          }}
                        >
                          #{peer.joinOrder}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0 overflow-hidden", peer.avatarColor || "m3-btn-filled")}>
                            {peer.avatarImage ? (
                              <img src={peer.avatarImage} alt={peer.username} className="w-full h-full object-cover" />
                            ) : (
                              peer.username.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-text truncate flex items-center gap-1.5 text-xs sm:text-sm">
                              <span className="truncate">{peer.username}</span>
                              {isLocal && (
                                <span
                                  className="text-[9px] font-bold px-2 py-0.2 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor: 'var(--md-sys-color-tertiary-container)',
                                    color: 'var(--md-sys-color-on-tertiary-container)',
                                  }}
                                >
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted truncate">
                              {peer.peerId.substring(0, 10)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono text-muted text-[11px] hidden md:table-cell">
                        {peer.endpoint}
                      </td>

                      <td className="py-3 px-3 font-mono hidden sm:table-cell">
                        {isDead ? (
                          <span className="text-rose-500 font-semibold">TIMEOUT</span>
                        ) : (
                          <span className="text-emerald-500 font-semibold">
                            {peer.latencyMs}ms
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {isHost ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              backgroundColor: 'var(--md-sys-color-primary-container)',
                              color: 'var(--md-sys-color-on-primary-container)',
                            }}
                          >
                            <Crown className="w-3 h-3" /> HOST
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              backgroundColor: 'var(--md-sys-color-surface-container-high)',
                              color: 'var(--md-sys-color-on-surface-variant)',
                            }}
                          >
                            PEER
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px] hidden sm:table-cell">
                        {isDead ? (
                          <span className="text-muted/60">—</span>
                        ) : isHost ? (
                          <span className="text-[color:var(--md-sys-color-primary)] font-bold">
                            {isStandalone ? "Standalone Host" : "Active Leader"}
                          </span>
                        ) : isNext ? (
                          <span className="text-[color:var(--md-sys-color-tertiary)] font-bold flex items-center gap-1">
                            <Zap className="w-3 h-3" /> 1st In Line
                          </span>
                        ) : (
                          <span className="text-muted">Rank #{peer.joinOrder}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold",
                          isDead 
                            ? "bg-rose-500/15 text-rose-500" 
                            : isStandalone
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-emerald-500/15 text-emerald-500"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isDead ? "bg-rose-500" : isStandalone ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                          )} />
                          {isDead ? "DEAD" : isStandalone ? "STANDALONE" : "ONLINE"}
                        </span>
                      </td>

                      {role === 'host' && (
                        <td className="py-3 px-3 text-right">
                          {!isHost && !isDead && (
                            <button
                              onClick={() => {
                                if (onTransferHostControl) {
                                  onTransferHostControl(peer.peerId);
                                } else {
                                  handleSimulateGracefulHandoff();
                                }
                              }}
                              className="px-3 py-1 rounded-full m3-btn-filled font-semibold text-[10px] transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
                              title={`Transfer Host control to ${peer.username} and become 1st heir`}
                            >
                              <Crown className="w-3 h-3" />
                              <span>Transfer Host</span>
                            </button>
                          )}
                          {isHost && (
                            <span className="text-[10px] text-muted font-mono italic">Current Host</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Standalone Empty-State Notification */}
          {isStandalone && (
            <div
              className="mt-3.5 p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-low)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--md-sys-color-secondary-container)',
                    color: 'var(--md-sys-color-on-secondary-container)',
                  }}
                >
                  <WifiOff className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-text">No Remote Peers Linked</div>
                  <div className="text-[11px] text-muted max-w-md leading-relaxed">
                    This node is running standalone. When peers connect via QR code or connection token, they are registered here with deterministic failover succession.
                  </div>
                </div>
              </div>
              {onNavigateToConnect && (
                <button
                  onClick={onNavigateToConnect}
                  className="px-4 py-2 text-xs font-semibold rounded-full m3-btn-filled shrink-0 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Connect Peers</span>
                </button>
              )}
            </div>
          )}

          {/* Failover Telemetry Log Feed */}
          <div
            className="mt-4 pt-3.5 border-t flex flex-col"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <div className="text-[10px] sm:text-[11px] font-mono text-muted uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[color:var(--md-sys-color-primary)] animate-pulse" />
                <span>Deterministic Election Protocol Telemetry</span>
              </span>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-muted hover:text-text transition-colors cursor-pointer"
              >
                Clear Log
              </button>
            </div>

            <div 
              ref={logContainerRef}
              className="h-28 sm:h-32 overflow-y-auto pr-1 space-y-1.5 font-mono text-[10px] sm:text-[11px] p-3 rounded-2xl border scrollbar-hide"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-low)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              {logs.map(l => (
                <div key={l.id} className="flex items-start gap-2">
                  <span className="text-muted/60 text-[9px] sm:text-[10px] mt-0.5 shrink-0">[{l.time}]</span>
                  <span className={cn(
                    "flex-1 leading-relaxed",
                    l.type === 'err' ? "text-rose-500 font-semibold" : l.type === 'ok' ? "text-emerald-500 font-semibold" : l.type === 'warn' ? "text-amber-500" : "text-text/85"
                  )}>
                    {l.text}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted/50 text-center py-4">Telemetry standby. Awaiting failover events...</div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Failover Simulation & Testing Suite */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          <div
            className="m3-card-xl p-4 sm:p-5 rounded-[28px] border shadow-xs flex flex-col gap-3"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-text flex items-center gap-2">
                <Zap className="w-4 h-4 text-[color:var(--md-sys-color-primary)]" />
                <span>Failover Simulator</span>
              </h4>
              {isSimActive && (
                <button 
                  onClick={handleResetTopology}
                  className="px-2.5 py-1 rounded-full m3-surface-interactive border text-xs text-muted hover:text-text flex items-center gap-1 font-mono transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                  title="Reset mesh to healthy state"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            {isSimActive ? (
              <>
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-current animate-ping flex-shrink-0" />
                    <span className="text-[11px] font-mono font-bold truncate">Simulation Sandbox Active</span>
                  </div>
                  <button 
                    onClick={handleToggleSim}
                    className="text-[10px] font-mono font-bold cursor-pointer underline flex-shrink-0"
                  >
                    Exit
                  </button>
                </div>

                <p className="text-[11px] sm:text-xs text-muted leading-relaxed">
                  Test host crash detection, deterministic leader election, simultaneous disconnect fallbacks, and quorum enforcement.
                </p>

                <div className="flex flex-col gap-2 mt-1">
                  {/* Button 1: Abrupt Host Drop */}
                  <button
                    onClick={handleSimulateAbruptHostDrop}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-rose-500 mb-1">
                      <span>1. Abrupt Host Drop</span>
                      <AlertTriangle className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Host crashes silently. Watchdog detects missed heartbeats (5.0s) and promotes First Joiner.
                    </div>
                  </button>

                  {/* Button 2: Graceful Handoff */}
                  <button
                    onClick={handleSimulateGracefulHandoff}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl m3-surface-interactive border text-text transition-all group cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--md-sys-color-primary)] mb-1">
                      <span>2. Graceful HOST_HANDOFF</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Host sends signed handoff token before exit. Successor promotes instantly with zero delay.
                    </div>
                  </button>

                  {/* Button 3: Simultaneous Disconnect */}
                  <button
                    onClick={handleSimulateSimultaneousDrop}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-500 mb-1">
                      <span>3. Host + 1st Joiner Drop</span>
                      <Fingerprint className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Both Host & heir crash. First candidate times out; system falls back to 2nd Joiner.
                    </div>
                  </button>

                  {/* Button 4: Quorum Partition */}
                  <button
                    onClick={handleSimulatePartition}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl m3-surface-interactive border text-text transition-all group cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--md-sys-color-tertiary)] mb-1">
                      <span>4. Network Partition</span>
                      <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Split network test. Demonstrates how minority partitions pause commits without quorum (&gt; 50%).
                    </div>
                  </button>
                </div>
              </>
            ) : role === 'host' ? (
              /* Live Host Authority Controls */
              <div className="flex flex-col gap-3 py-1">
                <div
                  className="flex items-center justify-between pb-2.5 border-b"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-[color:var(--md-sys-color-primary)]" />
                    <span className="text-xs font-bold text-text uppercase tracking-wider">Host Authority Controls</span>
                  </div>
                  <span
                    className="text-[9px] px-2.5 py-0.5 rounded-full font-mono font-bold"
                    style={{
                      backgroundColor: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    Host Exclusive
                  </span>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={() => {
                      if (onGracefulHostDrop) {
                        onGracefulHostDrop();
                      } else {
                        handleSimulateGracefulHandoff();
                      }
                    }}
                    className="w-full text-left p-3.5 rounded-2xl m3-surface-interactive border transition-all group cursor-pointer shadow-2xs active:scale-[0.99]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--md-sys-color-primary)] mb-1">
                      <span className="flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5" /> Graceful Host Drop
                      </span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Step down as Host and immediately transfer host authority to the 1st joiner (heir).
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (onNetworkSplit) {
                        onNetworkSplit();
                      } else {
                        handleSimulatePartition();
                      }
                    }}
                    className="w-full text-left p-3.5 rounded-2xl m3-surface-interactive border transition-all group cursor-pointer shadow-2xs active:scale-[0.99]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--md-sys-color-tertiary)] mb-1">
                      <span className="flex items-center gap-1.5">
                        <WifiOff className="w-3.5 h-3.5" /> Network Split Test
                      </span>
                      <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Simulate network partition. Validates that split sub-networks prevent split-brain without majority quorum.
                    </div>
                  </button>
                </div>

                <div
                  className="pt-2.5 border-t flex items-center justify-between"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  <span className="text-[10px] text-muted font-mono">Sandbox Scenarios</span>
                  <button
                    onClick={handleToggleSim}
                    className="px-3.5 py-1.5 rounded-full m3-btn-tonal text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <FlaskConical className="w-3 h-3" />
                    <span>Enter Simulation</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Locked State in Live Mode for Joiners */
              <div className="flex flex-col items-center text-center py-5 px-3 gap-3">
                <div
                  className="w-12 h-12 rounded-2xl border flex items-center justify-center text-muted"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-low)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <Lock className="w-5 h-5" />
                </div>
                
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-text mb-1">
                    Simulation Triggers Locked
                  </h5>
                  <p className="text-[11px] sm:text-xs text-muted leading-relaxed max-w-xs">
                    Failure injection and partition tests are available in <strong>Simulation Mode</strong> to protect live Quantum Link tunnels.
                  </p>
                </div>

                <button
                  onClick={handleToggleSim}
                  className="mt-1 px-4 py-2 rounded-full m3-btn-filled text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>Enable Simulation Mode</span>
                </button>
              </div>
            )}
          </div>

          {/* Protocol Invariants Card */}
          <div
            className="m3-card p-4 rounded-2xl border shadow-2xs flex flex-col gap-2 text-xs"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <h5 className="font-bold text-text flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Quantum Link Mesh Invariants</span>
            </h5>
            <ul className="text-muted space-y-1.5 text-[11px] pl-1">
              <li>• <strong className="text-text">Determinism:</strong> Identical sequence sorting across all nodes guarantees zero election conflict.</li>
              <li>• <strong className="text-text">No Split-Brain:</strong> Requires majority ACK (&gt; 50% surviving nodes).</li>
              <li>• <strong className="text-text">Signed Handoff:</strong> Cryptographic succession tokens prevent spoofing.</li>
              <li>• <strong className="text-text">Seamless Re-routing:</strong> In-memory WebRTC session buffers preserved.</li>
            </ul>
          </div>

        </div>

      </div>

    </div>
  );
}
