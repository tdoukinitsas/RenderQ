import { defineStore } from 'pinia';

export interface SystemInfo {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  gpu: {
    name: string;
    usage: number;
    vram: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

export interface SystemMonitorState {
  info: SystemInfo | null;
  isMonitoring: boolean;
  updateInterval: number;
  history: {
    cpu: number[];
    memory: number[];
    gpu: number[];
    gpuVram: number[];
    timestamps: number[];
  };
}

export const useSystemMonitorStore = defineStore('systemMonitor', {
  state: (): SystemMonitorState => ({
    info: null,
    isMonitoring: false,
    updateInterval: 1000,
    history: {
      cpu: [],
      memory: [],
      gpu: [],
      gpuVram: [],
      timestamps: [],
    },
  }),

  getters: {
    cpuUsage: (state) => state.info?.cpu.usage || 0,
    memoryUsage: (state) => state.info?.memory.percentage || 0,
    gpuUsage: (state) => state.info?.gpu.usage || 0,
    gpuVramUsage: (state) => state.info?.gpu.vram.percentage || 0,
    
    memoryUsedGB: (state) => {
      if (!state.info) return 0;
      return state.info.memory.used / (1024 * 1024 * 1024);
    },
    
    memoryTotalGB: (state) => {
      if (!state.info) return 0;
      return state.info.memory.total / (1024 * 1024 * 1024);
    },
    
    gpuVramUsedMB: (state) => state.info?.gpu.vram.used || 0,
    gpuVramTotalMB: (state) => state.info?.gpu.vram.total || 0,
    gpuName: (state) => state.info?.gpu.name || 'Unknown',
  },

  actions: {
    async updateSystemInfo() {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const info = await (window as any).electronAPI.getSystemInfo();
        if (info) {
          this.info = info;
          
          // Add to history (keep last 60 entries = 1 minute at 1s interval)
          const maxHistory = 60;
          
          this.history.cpu.push(info.cpu.usage);
          this.history.memory.push(info.memory.percentage);
          this.history.gpu.push(info.gpu.usage);
          this.history.gpuVram.push(info.gpu.vram.percentage);
          this.history.timestamps.push(Date.now());
          
          if (this.history.cpu.length > maxHistory) {
            this.history.cpu.shift();
            this.history.memory.shift();
            this.history.gpu.shift();
            this.history.gpuVram.shift();
            this.history.timestamps.shift();
          }
        }
      }
    },

    startMonitoring() {
      if (this.isMonitoring) return;
      
      this.isMonitoring = true;
      this.updateSystemInfo();
      
      const intervalId = setInterval(() => {
        if (this.isMonitoring) {
          this.updateSystemInfo();
        } else {
          clearInterval(intervalId);
        }
      }, this.updateInterval);
    },

    stopMonitoring() {
      this.isMonitoring = false;
    },

    clearHistory() {
      this.history = {
        cpu: [],
        memory: [],
        gpu: [],
        gpuVram: [],
        timestamps: [],
      };
    },
  },
});
