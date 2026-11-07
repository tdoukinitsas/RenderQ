<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div ref="dialogRef" class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal__header">
        <h2 id="settings-title">Settings</h2>
        <button class="btn btn--ghost btn--icon" @click="$emit('close')" aria-label="Close settings" title="Close (Esc)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      
      <!-- Tabs -->
      <div class="settings-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          class="settings-tab"
          :class="{ 'settings-tab--active': activeTab === tab.id }"
          :style="getTabStyle(tab)"
          :aria-pressed="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      
      <div class="modal__body">
        <!-- General Tab -->
        <div v-if="activeTab === 'general'" class="tab-content">
          <div class="settings-section">
            <h3>Auto-Save & Notifications</h3>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.autoSave"
                @change="settings.toggleAutoSave()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Auto-save queue</span>
                <span class="setting-toggle__desc">Automatically save queue state to recover from crashes</span>
              </span>
            </label>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.notifications"
                @change="settings.toggleNotifications()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Desktop notifications</span>
                <span class="setting-toggle__desc">Show notifications when renders complete or encounter errors</span>
              </span>
            </label>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.continueOnRenderErrors"
                @change="settings.toggleContinueOnRenderErrors()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Continue past render errors</span>
                <span class="setting-toggle__desc">A failed job doesn't stop the queue. Blender and Nuke retry a failed frame once, then skip it and carry on; skipped frames get one more try before the job ends, so later jobs that use them aren't left short</span>
              </span>
            </label>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.showPreview"
                @change="settings.togglePreview()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Show preview</span>
                <span class="setting-toggle__desc">Display the latest rendered frame in the preview panel</span>
              </span>
            </label>
          </div>
        </div>
        
        <!-- Blender Tab -->
        <div v-if="activeTab === 'blender'" class="tab-content">
          <div class="settings-section">
            <h3>Blender Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in blenderInstallations" 
                  :key="install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.blender === install.path }"
                  @click="selectAppInstallation('blender', install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Blender {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.blender === install.path" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="blenderInstallations.length === 0" class="installation-empty">
                  No Blender installations found in default locations
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.blender"
                  placeholder="Path to blender executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('blender')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.blender && customPaths.blender !== settings.applicationPaths?.blender"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('blender')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
        </div>
        
        <!-- Cinema 4D Tab -->
        <div v-if="activeTab === 'cinema4d'" class="tab-content">
          <div class="settings-section">
            <h3>Cinema 4D Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in cinema4dInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.cinema4d === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('cinema4d', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Cinema 4D {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.cinema4d === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="cinema4dInstallations.length === 0" class="installation-empty">
                  No Cinema 4D installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.cinema4d"
                  placeholder="Path to Commandline.exe"
                />
                <button class="btn btn--secondary" @click="browseAppPath('cinema4d')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.cinema4d && customPaths.cinema4d !== settings.applicationPaths?.cinema4d"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('cinema4d')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Take (optional)</label>
              <input 
                type="text" 
                class="form-input"
                v-model="appSettings.cinema4d.take"
                placeholder="Main"
                @change="saveAppSettings('cinema4d')"
              />
              <span class="form-hint">Leave empty to use the scene's active take</span>
            </div>
            
            <div class="form-group">
              <label class="form-label">Threads</label>
              <input 
                type="number" 
                class="form-input"
                v-model.number="appSettings.cinema4d.threads"
                placeholder="0 (auto)"
                min="0"
                @change="saveAppSettings('cinema4d')"
              />
              <span class="form-hint">0 = automatic (use all available cores)</span>
            </div>
          </div>
        </div>
        
        <!-- Houdini Tab -->
        <div v-if="activeTab === 'houdini'" class="tab-content">
          <div class="settings-section">
            <h3>Houdini Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in houdiniInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.houdini === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('houdini', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Houdini {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.houdini === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="houdiniInstallations.length === 0" class="installation-empty">
                  No Houdini installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.houdini"
                  placeholder="Path to hbatch executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('houdini')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.houdini && customPaths.houdini !== settings.applicationPaths?.houdini"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('houdini')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Render Node</label>
              <input 
                type="text" 
                class="form-input form-input--mono"
                v-model="appSettings.houdini.renderNode"
                placeholder="/out/mantra1"
                @change="saveAppSettings('houdini')"
              />
              <span class="form-hint">The ROP node path to render (e.g., /out/mantra1, /out/karma1)</span>
            </div>
          </div>
        </div>
        
        <!-- After Effects Tab -->
        <div v-if="activeTab === 'aftereffects'" class="tab-content">
          <div class="settings-section">
            <h3>After Effects Installation</h3>
            <p class="form-hint" style="margin-bottom: 12px;">
              RenderQ uses aerender for command-line rendering. The GUI application (AfterFX.exe) is not used.
            </p>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in aftereffectsInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.aftereffects === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('aftereffects', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">After Effects {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.aftereffects === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="aftereffectsInstallations.length === 0" class="installation-empty">
                  No After Effects installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.aftereffects"
                  placeholder="Path to aerender executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('aftereffects')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.aftereffects && customPaths.aftereffects !== settings.applicationPaths?.aftereffects"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('aftereffects')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Composition (optional)</label>
              <input 
                type="text" 
                class="form-input"
                v-model="appSettings.aftereffects.composition"
                placeholder="Main Comp"
                @change="saveAppSettings('aftereffects')"
              />
              <span class="form-hint">Leave empty to render all render queue items</span>
            </div>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                v-model="appSettings.aftereffects.multiFrameRendering"
                @change="saveAppSettings('aftereffects')"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Multi-Frame Rendering</span>
                <span class="setting-toggle__desc">Enable parallel frame rendering for better performance</span>
              </span>
            </label>
          </div>
        </div>
        
        <!-- Nuke Tab -->
        <div v-if="activeTab === 'nuke'" class="tab-content">
          <div class="settings-section">
            <h3>Nuke Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in nukeInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.nuke === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('nuke', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Nuke {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.nuke === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="nukeInstallations.length === 0" class="installation-empty">
                  No Nuke installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.nuke"
                  placeholder="Path to Nuke executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('nuke')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.nuke && customPaths.nuke !== settings.applicationPaths?.nuke"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('nuke')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Licence</label>
              <select
                class="form-input"
                v-model="appSettings.nuke.licenseMode"
                @change="saveAppSettings('nuke')"
              >
                <option value="auto">Auto (.nkind: Indie, .nknc: Non-commercial, .nk: first licence that works)</option>
                <option value="nuke">Nuke</option>
                <option value="nuke-interactive">Nuke - interactive licence (-i)</option>
                <option value="nukex">NukeX</option>
                <option value="nukex-interactive">NukeX - interactive licence (-i)</option>
                <option value="indie">Nuke Indie</option>
                <option value="nc">Nuke Non-commercial</option>
              </select>
              <span class="form-hint">Indie can only open .nkind comps and Non-commercial only .nknc/.nk; full Nuke cannot open either of those.</span>
              <div style="margin-top: 8px;">
                <button class="btn btn--secondary btn--sm" :disabled="nukeDetect.running" @click="detectNukeLicenses">
                  {{ nukeDetect.running ? 'Checking licences…' : 'Detect licences' }}
                </button>
              </div>
              <ul v-if="nukeDetect.results.length" class="form-hint" style="margin: 8px 0 0; padding-left: 18px;">
                <li v-for="r in nukeDetect.results" :key="r.license">
                  {{ r.ok ? '✓' : '✗' }} {{ r.label }}{{ r.ok ? ` (${r.version})` : ` - ${r.detail}` }}
                </li>
              </ul>
              <span v-if="nukeDetect.error" class="form-hint" style="color: var(--color-error, #f87171);">{{ nukeDetect.error }}</span>
            </div>

            <div class="form-group">
              <label class="form-label">Nuke mode</label>
              <select
                class="form-input"
                v-model="appSettings.nuke.nukeMode"
                @change="saveAppSettings('nuke')"
              >
                <option value="auto">Auto (terminal; hidden GUI when a node only loads in the GUI)</option>
                <option value="terminal">Terminal only</option>
                <option value="gui">GUI (hidden window)</option>
              </select>
              <span class="form-hint">Some gizmos only load in the Nuke GUI (e.g. Indie .gzind gizmos Nuke Indie refuses to render from the command line). Auto renders those comps in the GUI with no window.</span>
            </div>

            <label class="setting-toggle">
              <input
                type="checkbox"
                :checked="appSettings.nuke.gpu !== false"
                @change="appSettings.nuke.gpu = ($event.target as HTMLInputElement).checked; saveAppSettings('nuke')"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Use GPU</span>
                <span class="setting-toggle__desc">GPU nodes (ZDefocus, Kronos, BlinkScript…) use the GPU; without it Nuke's render mode runs them on the CPU</span>
              </span>
            </label>

            <div class="form-group">
              <label class="form-label">Threads</label>
              <input
                type="number"
                class="form-input"
                v-model.number="appSettings.nuke.threads"
                placeholder="0 (auto)"
                min="0"
                @change="saveAppSettings('nuke')"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Cache memory limit</label>
              <input
                type="text"
                class="form-input form-input--mono"
                v-model.trim="appSettings.nuke.cacheSize"
                placeholder="Nuke default (e.g. 16G)"
                @change="saveAppSettings('nuke')"
              />
            </div>
          </div>
        </div>
        
        <!-- Maya Tab -->
        <div v-if="activeTab === 'maya'" class="tab-content">
          <div class="settings-section">
            <h3>Maya Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in mayaInstallations" 
                  :key="install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.maya === install.path }"
                  @click="selectAppInstallation('maya', install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Maya {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.maya === install.path" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="mayaInstallations.length === 0" class="installation-empty">
                  No Maya installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.maya"
                  placeholder="Path to Maya Render executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('maya')">
                  Browse
                </button>
              </div>
              <span class="form-hint">Select the Render.exe file in Maya's bin folder</span>
              <button 
                v-if="customPaths.maya && customPaths.maya !== settings.applicationPaths?.maya"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('maya')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
        </div>

        <!-- MCP Server Tab -->
        <div v-if="activeTab === 'mcp'" class="tab-content">
          <div class="settings-section">
            <h3>MCP Server</h3>
            <p class="form-hint mcp-intro">
              Lets AI agents such as Claude, Codex or Cursor run this render queue through the Model Context Protocol:
              add scene files, change jobs, load and save queue files, start and stop renders, and follow progress,
              estimated completion time and errors. Everything an agent does shows up here as it happens.
            </p>

            <label class="setting-toggle">
              <input
                type="checkbox"
                :checked="settings.mcpEnabled"
                @change="settings.setMcpEnabled(($event.target as HTMLInputElement).checked)"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Enable MCP server</span>
                <span class="setting-toggle__desc">Runs a server on this computer only (127.0.0.1), protected by an access token. Connected agents can start RenderQ when they need it.</span>
              </span>
            </label>

            <div class="mcp-status" :class="`mcp-status--${mcpStatusKind}`" role="status">
              <span class="mcp-status__dot" aria-hidden="true"></span>
              <span>{{ mcpStatusText }}</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="mcp-port">Port</label>
              <div class="input-with-button mcp-port">
                <input
                  id="mcp-port"
                  type="number"
                  class="form-input form-input--mono"
                  v-model.number="mcpPortInput"
                  min="1024"
                  max="65535"
                  @keydown.enter="applyMcpPort"
                />
                <button
                  class="btn btn--secondary"
                  :disabled="mcpPortInput === settings.mcpPort"
                  @click="applyMcpPort"
                >
                  Apply
                </button>
              </div>
              <span v-if="mcpPortError" class="form-hint mcp-error">{{ mcpPortError }}</span>
              <span v-else class="form-hint">Default {{ DEFAULT_MCP_PORT }}. Connected agents find the new port by themselves.</span>
            </div>

            <label class="setting-toggle">
              <input
                type="checkbox"
                :checked="settings.mcpAllowScripts"
                @change="settings.setMcpAllowScripts(($event.target as HTMLInputElement).checked)"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Allow agents to set pre-render scripts and executable paths</span>
                <span class="setting-toggle__desc">Pre-render Python (Blender, Nuke) and per-job executable paths run code on this computer. While this is off, agents can change every other job setting but not these.</span>
              </span>
            </label>
          </div>

          <div class="settings-section">
            <h3>Connect an Agent</h3>
            <p class="form-hint mcp-intro">
              Adds RenderQ to the agent's MCP settings. Your other settings are kept, and a backup of the file is saved next to it.
              The agent runs a small bridge inside RenderQ, so nothing else needs installing.
            </p>

            <div class="mcp-clients">
              <div v-for="client in mcpClients" :key="client.id" class="mcp-client">
                <div class="mcp-client__info">
                  <span class="mcp-client__name">
                    {{ client.name }}
                    <span v-if="client.description" class="mcp-client__desc">{{ client.description }}</span>
                  </span>
                  <span class="mcp-client__path" :title="client.configPath">{{ client.configPath }}</span>
                  <span v-if="mcpClientMessages[client.id]" class="mcp-client__message" :class="{ 'mcp-error': mcpClientMessages[client.id].error }">
                    {{ mcpClientMessages[client.id].text }}
                  </span>
                  <span v-else-if="client.error" class="mcp-client__message mcp-error">{{ client.error }}</span>
                </div>
                <span class="badge" :class="clientBadgeClass(client)">{{ clientBadgeText(client) }}</span>
                <div class="mcp-client__actions">
                  <button
                    class="btn btn--sm"
                    :class="client.state === 'installed' ? 'btn--secondary' : 'btn--primary'"
                    :disabled="mcpBusy === client.id"
                    @click="installMcpClient(client)"
                  >
                    {{ client.state === 'installed' ? 'Reinstall' : client.state === 'outdated' ? 'Update' : 'Install' }}
                  </button>
                  <button
                    v-if="client.state !== 'not-installed'"
                    class="btn btn--ghost btn--sm"
                    :disabled="mcpBusy === client.id"
                    @click="uninstallMcpClient(client)"
                  >
                    Remove
                  </button>
                  <button class="btn btn--ghost btn--sm" :title="`Copy the config to add to ${client.name} by hand`" @click="copyMcpSnippet(client)">
                    {{ mcpCopied === client.id ? 'Copied' : 'Copy config' }}
                  </button>
                </div>
              </div>
              <div v-if="mcpClientsError" class="installation-empty mcp-error">{{ mcpClientsError }}</div>
            </div>

            <p class="form-hint">
              ChatGPT: the ChatGPT app only connects to MCP servers on the internet, not to programs on your computer.
              Use OpenAI Codex (above) instead.
            </p>
          </div>

          <div class="settings-section">
            <h3>Other Agents</h3>
            <div class="form-group">
              <label class="form-label">Command (stdio)</label>
              <span class="form-hint mcp-intro">Most MCP clients take a JSON entry like the ones above. Run this with the environment variable <code>ELECTRON_RUN_AS_NODE=1</code>:</span>
              <pre class="mcp-code">{{ mcpCommandLine || '…' }}</pre>
              <button class="btn btn--secondary btn--sm" @click="copyGenericConfig">
                {{ mcpCopied === 'generic' ? 'Copied' : 'Copy JSON config' }}
              </button>
            </div>
            <div class="form-group">
              <label class="form-label">Streamable HTTP</label>
              <span class="form-hint mcp-intro">For clients that connect over HTTP. They can't start RenderQ, and the access token changes every time RenderQ starts.</span>
              <pre class="mcp-code">{{ mcpStatus?.url || `http://127.0.0.1:${settings.mcpPort}/mcp` }}
Authorization: Bearer {{ mcpStatus?.token ? '•'.repeat(12) : '(start the server first)' }}</pre>
              <button class="btn btn--secondary btn--sm" :disabled="!mcpStatus?.token" @click="copyHttpConfig">
                {{ mcpCopied === 'http' ? 'Copied' : 'Copy URL and token' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal__footer">
        <button class="btn btn--secondary" @click="$emit('close')">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRenderQueueStore } from '~/stores/renderQueue';
import { useSettingsStore, DEFAULT_MCP_PORT } from '~/stores/settings';
import { ApplicationType } from '~/types/applications';
import { useModalDialog } from '~/composables/useModalDialog';
import type { McpServerStatus, McpClientStatus } from '~/types/electron';

const renderQueue = useRenderQueueStore();
const settings = useSettingsStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
useModalDialog(dialogRef, () => emit('close'));

// Tab configuration
const tabs = [
  { id: 'general', label: 'General', color: null },
  { id: 'blender', label: 'Blender', color: '#ff9966' },
  { id: 'cinema4d', label: 'Cinema 4D', color: '#3b82f6' },
  { id: 'houdini', label: 'Houdini', color: '#ff6b35' },
  { id: 'aftereffects', label: 'After Effects', color: '#9d4edd' },
  { id: 'nuke', label: 'Nuke', color: '#fbbf24' },
  { id: 'maya', label: 'Maya', color: '#00B4B4' },
  { id: 'mcp', label: 'MCP Server', color: null },
];

const activeTab = ref('general');

// ============================================================ MCP Server tab

const mcpStatus = ref<McpServerStatus | null>(null);
const mcpClients = ref<McpClientStatus[]>([]);
const mcpClientsError = ref('');
const mcpClientMessages = reactive<Record<string, { text: string; error: boolean }>>({});
const mcpBusy = ref<string | null>(null);
const mcpCopied = ref<string | null>(null);
const mcpPortInput = ref<number>(settings.mcpPort);
const mcpPortError = ref('');
const mcpGenericConfig = ref('');
const mcpCommandLine = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const mcpStatusKind = computed(() => {
  const s = mcpStatus.value;
  if (!settings.mcpEnabled) return 'off';
  if (!s || s.state === 'starting') return 'starting';
  return s.state === 'running' ? 'on' : s.state === 'error' ? 'error' : 'off';
});

const mcpStatusText = computed(() => {
  const s = mcpStatus.value;
  if (!settings.mcpEnabled) return 'Off';
  if (!s || s.state === 'starting') return 'Starting…';
  if (s.state === 'error') return `Not running: ${s.error}`;
  if (s.state !== 'running') return 'Stopped';
  const names = [...new Set(s.sessions.map(x => x.name.replace(/ \(via renderq-mcp\)$/, '')))];
  const agents = s.sessions.length === 0
    ? 'no agents connected'
    : `${s.sessions.length} agent${s.sessions.length === 1 ? '' : 's'} connected (${names.join(', ')})`;
  return `Running at ${s.url}, ${agents}`;
});

function clientBadgeClass(client: McpClientStatus) {
  if (client.state === 'installed') return 'badge--complete';
  if (client.state === 'outdated') return 'badge--paused';
  return client.detected ? 'badge--idle' : 'badge--loading-static';
}

function clientBadgeText(client: McpClientStatus) {
  if (client.state === 'installed') return 'Installed';
  if (client.state === 'outdated') return 'Needs update';
  return client.detected ? 'Not installed' : 'Not found';
}

async function refreshMcpStatus() {
  const api = (window as any).electronAPI;
  if (!api?.mcpGetStatus) return;
  mcpStatus.value = await api.mcpGetStatus();
}

async function refreshMcpClients() {
  const api = (window as any).electronAPI;
  if (!api?.mcpGetClients) return;
  const result = await api.mcpGetClients();
  if (result.success) {
    mcpClients.value = result.clients;
    mcpClientsError.value = '';
  } else {
    mcpClientsError.value = result.error || 'Could not read the agent settings';
  }
  // generic stdio config = the common "mcpServers" shape
  const snippet = await api.mcpClientSnippet?.('claude-desktop');
  if (snippet?.success) {
    mcpGenericConfig.value = snippet.text;
    try {
      const entry = JSON.parse(snippet.text).mcpServers.renderq;
      mcpCommandLine.value = [entry.command, ...entry.args].map((a: string) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    } catch { /* leave empty */ }
  }
}

async function installMcpClient(client: McpClientStatus) {
  const api = (window as any).electronAPI;
  mcpBusy.value = client.id;
  try {
    const result = await api.mcpInstallClient(client.id);
    mcpClientMessages[client.id] = result.success
      ? { text: `Added. ${result.restartHint || ''}`.trim(), error: false }
      : { text: result.error || 'Could not install', error: true };
    if (result.success && !settings.mcpEnabled) settings.setMcpEnabled(true);
  } finally {
    mcpBusy.value = null;
    await refreshMcpClients();
  }
}

async function uninstallMcpClient(client: McpClientStatus) {
  const api = (window as any).electronAPI;
  mcpBusy.value = client.id;
  try {
    const result = await api.mcpUninstallClient(client.id);
    mcpClientMessages[client.id] = result.success
      ? { text: 'Removed.', error: false }
      : { text: result.error || 'Could not remove', error: true };
  } finally {
    mcpBusy.value = null;
    await refreshMcpClients();
  }
}

function copyText(text: string, key: string) {
  (window as any).electronAPI?.copyText?.(text);
  mcpCopied.value = key;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { mcpCopied.value = null; }, 2000);
}

async function copyMcpSnippet(client: McpClientStatus) {
  const result = await (window as any).electronAPI.mcpClientSnippet(client.id);
  if (result.success) copyText(result.text, client.id);
  else mcpClientMessages[client.id] = { text: result.error || 'Could not build the config', error: true };
}

function copyGenericConfig() {
  if (mcpGenericConfig.value) copyText(mcpGenericConfig.value, 'generic');
}

function copyHttpConfig() {
  const s = mcpStatus.value;
  if (!s?.token) return;
  copyText(`URL: ${s.url}\nAuthorization: Bearer ${s.token}`, 'http');
}

function applyMcpPort() {
  const port = Number(mcpPortInput.value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    mcpPortError.value = 'Enter a port between 1024 and 65535.';
    return;
  }
  mcpPortError.value = '';
  if (port !== settings.mcpPort) settings.setMcpPort(port);
}

watch(activeTab, (tab) => {
  if (tab === 'mcp') {
    refreshMcpStatus();
    refreshMcpClients();
  }
});

onMounted(() => {
  const api = (window as any).electronAPI;
  api?.onMcpStatus?.((status: McpServerStatus) => { mcpStatus.value = status; });
});

onUnmounted(() => {
  (window as any).electronAPI?.removeAllListeners?.('mcp-status');
  if (copiedTimer) clearTimeout(copiedTimer);
});

// Installation lists
const blenderInstallations = ref<any[]>([]);
const cinema4dInstallations = ref<any[]>([]);
const houdiniInstallations = ref<any[]>([]);
const aftereffectsInstallations = ref<any[]>([]);
const nukeInstallations = ref<any[]>([]);
const mayaInstallations = ref<any[]>([]);

// Custom paths
const customPaths = reactive({
  blender: '',
  cinema4d: '',
  houdini: '',
  aftereffects: '',
  nuke: '',
  maya: '',
});

// App-specific settings
const appSettings = reactive({
  cinema4d: {
    take: '',
    threads: 0,
  },
  houdini: {
    renderNode: '/out/mantra1',
  },
  aftereffects: {
    composition: '',
    multiFrameRendering: false,
  },
  nuke: {
    licenseMode: 'auto',
    nukeMode: 'auto',
    gpu: true,
    threads: 0,
    cacheSize: '',
  },
});

// Settings > Nuke > Detect licences
const nukeDetect = reactive<{ running: boolean; results: any[]; error: string }>({ running: false, results: [], error: '' });

async function detectNukeLicenses() {
  const api = (window as any).electronAPI;
  if (!api?.detectNukeLicenses) return;
  nukeDetect.running = true;
  nukeDetect.results = [];
  nukeDetect.error = '';
  try {
    const result = await api.detectNukeLicenses({ appPath: settings.applicationPaths?.nuke || '' });
    if (result.success) nukeDetect.results = result.results;
    else nukeDetect.error = result.error;
  } finally {
    nukeDetect.running = false;
  }
}

function getTabStyle(tab: typeof tabs[0]) {
  if (activeTab.value === tab.id && tab.color) {
    return {
      borderBottomColor: tab.color,
      color: tab.color,
    };
  }
  return {};
}

async function loadInstallations() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    try {
      // Load all installations in parallel
      const [blender, cinema4d, houdini, aftereffects, nuke, maya] = await Promise.all([
        (window as any).electronAPI.findBlenderInstallations(),
        (window as any).electronAPI.findCinema4DInstallations?.() || [],
        (window as any).electronAPI.findHoudiniInstallations?.() || [],
        (window as any).electronAPI.findAfterEffectsInstallations?.() || [],
        (window as any).electronAPI.findNukeInstallations?.() || [],
        (window as any).electronAPI.findMayaInstallations?.() || [],
      ]);
      
      blenderInstallations.value = blender || [];
      cinema4dInstallations.value = cinema4d || [];
      houdiniInstallations.value = houdini || [];
      aftereffectsInstallations.value = aftereffects || [];
      nukeInstallations.value = nuke || [];
      mayaInstallations.value = maya || [];
    } catch (error) {
      console.error('Failed to load installations:', error);
    }
  }
}

function loadSettings() {
  // Load custom paths from settings
  customPaths.blender = settings.applicationPaths?.blender || '';
  customPaths.cinema4d = settings.applicationPaths?.cinema4d || '';
  customPaths.houdini = settings.applicationPaths?.houdini || '';
  customPaths.aftereffects = settings.applicationPaths?.aftereffects || '';
  customPaths.nuke = settings.applicationPaths?.nuke || '';
  customPaths.maya = settings.applicationPaths?.maya || '';
  
  // Load app-specific settings
  if (settings.appSettings?.cinema4d) {
    Object.assign(appSettings.cinema4d, settings.appSettings.cinema4d);
  }
  if (settings.appSettings?.houdini) {
    Object.assign(appSettings.houdini, settings.appSettings.houdini);
  }
  if (settings.appSettings?.aftereffects) {
    Object.assign(appSettings.aftereffects, settings.appSettings.aftereffects);
  }
  if (settings.appSettings?.nuke) {
    Object.assign(appSettings.nuke, settings.appSettings.nuke);
  }
}

onMounted(() => {
  loadInstallations();
  loadSettings();
});

function selectAppInstallation(appType: string, path: string) {
  settings.setAppPath(appType as ApplicationType, path);
  (customPaths as any)[appType] = path;
  
  // Legacy: also update blenderPath in renderQueue for backwards compat
  if (appType === 'blender') {
    renderQueue.setBlenderPath(path);
  }
  
  // Re-validate jobs to update missing-app status
  renderQueue.validateJobApplications();
}

async function browseAppPath(appType: string) {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const path = await (window as any).electronAPI.browseAppPath?.(appType);
    if (path) {
      (customPaths as any)[appType] = path;
    }
  }
}

function applyCustomPath(appType: string) {
  const customPath = (customPaths as any)[appType];
  if (customPath) {
    settings.setAppPath(appType as ApplicationType, customPath);
    
    // Add a fake installation entry so the app is considered "found"
    // This helps with the missing-app status check
    const appTypeEnum = appType as ApplicationType;
    renderQueue.setAppInstallations(appTypeEnum, [
      ...renderQueue.getAppInstallations(appTypeEnum),
      {
        type: appTypeEnum,
        version: 'Custom',
        path: customPath,
        folder: 'Custom Installation',
      }
    ]);
    
    // Legacy: also update blenderPath in renderQueue
    if (appType === 'blender') {
      renderQueue.setBlenderPath(customPath);
    }
    
    // Re-validate jobs to update missing-app status
    renderQueue.validateJobApplications();
  }
}

function saveAppSettings(appType: string) {
  const appSettingsData = (appSettings as any)[appType];
  if (appSettingsData && settings.updateAppSettings) {
    settings.updateAppSettings(appType as ApplicationType, appSettingsData);
  }
}
</script>

<style lang="scss">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-modal;
}

.modal {
  background-color: $bg-secondary;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
  
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-05;
    border-bottom: 1px solid $border-subtle;
    
    h2 {
      margin: 0;
      font-size: $font-size-lg;
    }
  }
  
  &__body {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-05;
  }
  
  &__footer {
    padding: $spacing-04 $spacing-05;
    border-top: 1px solid $border-subtle;
    display: flex;
    justify-content: flex-end;
    gap: $spacing-03;
  }
}

// Settings Tabs
.settings-tabs {
  display: flex;
  border-bottom: 1px solid $border-subtle;
  padding: 0 $spacing-05;
  overflow-x: auto;
  flex-shrink: 0;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: $border-subtle;
    border-radius: 2px;
  }
}

.settings-tab {
  padding: $spacing-03 $spacing-04;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: $text-secondary;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  cursor: pointer;
  transition: all $transition-fast ease;
  white-space: nowrap;
  
  &:hover {
    color: $text-primary;
    background-color: $bg-hover;
  }
  
  &--active {
    color: $text-primary;
    border-bottom-color: $accent-primary;
  }
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-section {
  margin-bottom: $spacing-06;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  h3 {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-secondary;
    margin-bottom: $spacing-04;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.installation-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  max-height: 200px;
  overflow-y: auto;
}

.installation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-03 $spacing-04;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  cursor: pointer;
  transition: all $transition-fast ease;
  
  &:hover {
    border-color: $accent-primary;
  }
  
  &--selected {
    border-color: $accent-primary;
    background-color: rgba($accent-primary, 0.1);
  }
  
  &__info {
    display: flex;
    flex-direction: column;
    gap: $spacing-01;
    overflow: hidden;
  }
  
  &__version {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  
  &__path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  &__check {
    color: $accent-primary;
    flex-shrink: 0;
  }
}

.installation-empty {
  padding: $spacing-04;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
}

.form-group {
  margin-bottom: $spacing-04;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-secondary;
  margin-bottom: $spacing-02;
}

.form-hint {
  display: block;
  font-size: $font-size-xs;
  color: $text-tertiary;
  margin-top: $spacing-02;
}

.input-with-button {
  display: flex;
  gap: $spacing-03;
  
  input {
    flex: 1;
    min-width: 0;
  }
}

// MCP Server tab
.mcp-intro {
  margin: 0 0 $spacing-04;
}

.mcp-error {
  color: $status-error;
}

.mcp-status {
  display: flex;
  align-items: center;
  gap: $spacing-03;
  padding: $spacing-03 $spacing-04;
  margin-bottom: $spacing-04;
  border-radius: $radius-md;
  background-color: $bg-tertiary;
  font-size: $font-size-sm;
  color: $text-secondary;
  word-break: break-word;

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background-color: $text-tertiary;
  }

  &--on &__dot { background-color: $status-complete; }
  &--starting &__dot { background-color: $status-rendering; }
  &--error {
    color: $status-error;
    .mcp-status__dot { background-color: $status-error; }
  }
}

.mcp-port input {
  max-width: 160px;
  flex: 0 1 160px;
}

.mcp-clients {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  margin-bottom: $spacing-04;
}

.mcp-client {
  display: flex;
  align-items: center;
  gap: $spacing-04;
  padding: $spacing-03 $spacing-04;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;

  &__info {
    display: flex;
    flex-direction: column;
    gap: $spacing-01;
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__desc {
    font-weight: normal;
    color: $text-tertiary;
    margin-left: $spacing-02;
  }

  &__path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__message {
    font-size: $font-size-xs;
    color: $status-complete;
  }

  &__actions {
    display: flex;
    gap: $spacing-02;
    flex-shrink: 0;
  }

  .badge {
    flex-shrink: 0;
  }
}

.badge--loading-static {
  background-color: rgba($text-tertiary, 0.2);
  color: $text-tertiary;
}

.mcp-code {
  margin: 0 0 $spacing-03;
  padding: $spacing-03;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-all;
}

.setting-toggle {
  display: flex;
  align-items: flex-start;
  gap: $spacing-03;
  padding: $spacing-03;
  margin-bottom: $spacing-02;
  background-color: $bg-tertiary;
  border-radius: $radius-md;
  cursor: pointer;
  transition: background-color $transition-fast ease;
  
  &:hover {
    background-color: $bg-hover;
  }
  
  input {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    accent-color: $accent-primary;
  }
  
  &__label {
    display: flex;
    flex-direction: column;
    gap: $spacing-01;
  }
  
  &__title {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  
  &__desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}
</style>
