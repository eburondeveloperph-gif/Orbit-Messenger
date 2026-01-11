
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Client ---
const SUPABASE_URL = 'https://bridhpobwsfttwalwhih.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fc4iX_EGxN1Pzc4Py_SOog_8KJyvdQU';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface TranscriptionMessage {
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  translatedText?: string;
  isFinal: boolean;
}

interface UserProfile {
  displayName: string;
  status: string;
  avatarColor: string;
}

class OrbitStation {
  private ai: GoogleGenAI;
  private currentModel = 'gemini-2.5-flash-native-audio-preview-12-2025';
  private translationModel = 'gemini-3-flash-preview';
  
  private liveSession: any = null;
  private seamlessSession: any = null;
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  
  private isMuted = false;
  private isCamOff = false;
  private isAutoTranslateEnabled = false;
  private currentUser: any = null;
  
  private userProfile: UserProfile = {
    displayName: "Arbiter Node",
    status: "Station Online",
    avatarColor: "#007AFF"
  };
  
  private targetLanguage = "English";
  private selectedArbiters: Set<string> = new Set();
  private syncRoomChannel: any = null;
  private isFocusMode = false;
  
  // Speaker state
  private activeSpeakerId: string | null = null;
  private speakerHandoffTimeout: any = null;

  // DOM Elements
  private splashScreen = document.getElementById('splashScreen') as HTMLDivElement;
  private authOverlay = document.getElementById('authOverlay') as HTMLDivElement;
  private appShell = document.getElementById('appShell') as HTMLDivElement;
  private userInitials = document.getElementById('userInitials') as HTMLDivElement;
  private views = document.querySelectorAll('.view');
  private navItems = document.querySelectorAll('.nav-item');
  private peopleList = document.getElementById('peopleList') as HTMLDivElement;
  private initGroupCallBtn = document.getElementById('initGroupCallBtn') as HTMLButtonElement;
  private chatDetail = document.getElementById('chatDetail') as HTMLDivElement;
  private backToChats = document.getElementById('backToChats') as HTMLButtonElement;
  private messageContainer = document.getElementById('messageContainer') as HTMLDivElement;
  private msgInput = document.getElementById('msgInput') as HTMLInputElement;
  private sendMsgBtn = document.getElementById('sendMsgBtn') as HTMLButtonElement;
  private startCallBtn = document.getElementById('startCallBtn') as HTMLButtonElement;
  private callOverlay = document.getElementById('callOverlay') as HTMLDivElement;
  private endCallBtn = document.getElementById('endCallBtn') as HTMLButtonElement;
  private transcriptionStream = document.getElementById('transcriptionStream') as HTMLDivElement;
  private localVideo = document.getElementById('localVideo') as HTMLVideoElement;
  private localVideoCard = document.getElementById('localVideoCard') as HTMLDivElement;
  private videoGrid = document.getElementById('videoGrid') as HTMLDivElement;
  private callParticipantsLabel = document.getElementById('callParticipants') as HTMLSpanElement;
  private focusSpeakerBtn = document.getElementById('focusSpeakerBtn') as HTMLButtonElement;
  private activeModelLabel = document.getElementById('activeModelLabel') as HTMLSpanElement;

  // Dashboard Cards
  private dashCards = document.querySelectorAll('.dash-card');

  // Profile Specific DOM
  private profileAvatarLarge = document.getElementById('profileAvatarLarge') as HTMLDivElement;
  private profileDisplayNameLabel = document.getElementById('profileDisplayName') as HTMLHeadingElement;
  private profileEmailLabel = document.getElementById('profileEmailLabel') as HTMLParagraphElement;
  private profileStatusBadge = document.getElementById('profileStatusBadge') as HTMLDivElement;
  private displayNameInput = document.getElementById('displayNameInput') as HTMLInputElement;
  private statusInput = document.getElementById('statusInput') as HTMLInputElement;
  private saveProfileBtn = document.getElementById('saveProfileBtn') as HTMLDivElement;
  private llmModelSelect = document.getElementById('llmModelSelect') as HTMLSelectElement;

  // Settings
  private translationToggle = document.getElementById('translationToggle') as HTMLInputElement;
  private targetLangSelect = document.getElementById('targetLangSelect') as HTMLSelectElement;
  private colorSwatches = document.querySelectorAll('.color-swatch');

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.initSplashScreen();
    this.initEventListeners();
    this.checkAuth();
    this.loadPersonalization();
  }

  private initSplashScreen() {
    setTimeout(() => {
      this.splashScreen.style.opacity = '0';
      setTimeout(() => {
        this.splashScreen.classList.add('hidden');
        if (!this.currentUser) this.authOverlay.classList.remove('hidden');
      }, 1000);
    }, 3000);
  }

  private async checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      this.onAuthenticated(session.user);
    }
  }

  private initEventListeners() {
    document.getElementById('authBtn')?.addEventListener('click', () => this.handleAuth());

    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.getAttribute('data-view');
        this.switchView(viewId!);
        this.navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });

    this.dashCards.forEach(card => {
      card.addEventListener('click', () => {
        const action = card.getAttribute('data-action');
        switch(action) {
          case 'start-translation':
            this.switchView('chatsView');
            this.updateNavActive('chatsView');
            break;
          case 'join-call':
            this.switchView('peopleView');
            this.updateNavActive('peopleView');
            break;
          case 'open-settings':
            this.switchView('settingsView');
            this.updateNavActive('settingsView');
            break;
        }
      });
    });

    this.userInitials.addEventListener('click', () => {
       this.switchView('settingsView');
       this.updateNavActive('settingsView');
    });

    this.backToChats.addEventListener('click', () => {
      this.chatDetail.classList.add('hidden');
    });

    this.sendMsgBtn.addEventListener('click', () => this.sendMessage());
    this.msgInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.sendMessage());
    
    this.startCallBtn.addEventListener('click', () => this.startCall());
    this.endCallBtn.addEventListener('click', () => this.endCall());
    this.focusSpeakerBtn.addEventListener('click', () => this.toggleFocusMode());

    this.translationToggle.addEventListener('change', (e) => this.isAutoTranslateEnabled = (e.target as HTMLInputElement).checked);
    this.targetLangSelect.addEventListener('change', (e) => {
      this.targetLanguage = (e.target as HTMLSelectElement).value;
      localStorage.setItem('targetLanguage', this.targetLanguage);
    });

    this.llmModelSelect.addEventListener('change', (e) => {
      this.currentModel = (e.target as HTMLSelectElement).value;
      this.activeModelLabel.textContent = `Model: ${this.currentModel.split('-')[1]} ${this.currentModel.split('-')[2] || ''}`;
      localStorage.setItem('orbit_active_model', this.currentModel);
    });

    this.colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        const color = (e.currentTarget as HTMLElement).getAttribute('data-color')!;
        this.setAccentColor(color);
      });
    });

    this.saveProfileBtn.addEventListener('click', () => this.updateProfile());

    document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());
    document.getElementById('toggleMicBtn')?.addEventListener('click', (e) => this.toggleMic(e.currentTarget as HTMLButtonElement));
    document.getElementById('toggleCamBtn')?.addEventListener('click', (e) => this.toggleCam(e.currentTarget as HTMLButtonElement));
    document.getElementById('seamlessTranscriptionBtn')?.addEventListener('click', () => this.toggleSeamlessTranscription());

    document.querySelector('[data-room="Global Hub"]')?.addEventListener('click', () => {
        document.getElementById('roomTitle')!.textContent = "Global Hub";
        this.chatDetail.classList.remove('hidden');
        this.loadMessages();
    });
  }

  private updateNavActive(viewId: string) {
    this.navItems.forEach(i => {
      i.classList.toggle('active', i.getAttribute('data-view') === viewId);
    });
  }

  private async handleAuth() {
    const email = (document.getElementById('authEmail') as HTMLInputElement).value;
    const password = (document.getElementById('authPassword') as HTMLInputElement).value;
    if (!email || !password) return alert("Station access denied. Credentials required.");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const { data: upData, error: upError } = await supabase.auth.signUp({ email, password });
      if (upError) return alert(upError.message);
      if (upData.user) this.onAuthenticated(upData.user);
    } else if (data.user) {
      this.onAuthenticated(data.user);
    }
  }

  private onAuthenticated(user: any) {
    this.currentUser = user;
    this.authOverlay.classList.add('hidden');
    this.appShell.classList.remove('hidden');
    this.profileEmailLabel.textContent = user.email || "node@orbit.ai";
    
    const savedProfile = localStorage.getItem(`profile_${user.id}`);
    if (savedProfile) {
      this.userProfile = JSON.parse(savedProfile);
    } else {
      this.userProfile.displayName = user.email?.split('@')[0] || "Arbiter Node";
      this.userProfile.avatarColor = localStorage.getItem('accentColor') || "#007AFF";
    }
    
    this.applyProfileUI();
    this.loadArbiters();
    this.loadCallHistory();
  }

  private applyProfileUI() {
    const initials = this.userProfile.displayName.slice(0, 2).toUpperCase();
    this.userInitials.textContent = initials;
    this.userInitials.style.background = this.userProfile.avatarColor;
    
    this.profileAvatarLarge.textContent = initials;
    this.profileAvatarLarge.style.background = this.userProfile.avatarColor;
    this.profileDisplayNameLabel.textContent = this.userProfile.displayName;
    this.profileStatusBadge.textContent = this.userProfile.status;
    
    this.displayNameInput.value = this.userProfile.displayName;
    this.statusInput.value = this.userProfile.status;
  }

  private updateProfile() {
    this.userProfile.displayName = this.displayNameInput.value || "Arbiter Node";
    this.userProfile.status = this.statusInput.value || "Online";
    this.userProfile.avatarColor = localStorage.getItem('accentColor') || "#007AFF";
    
    localStorage.setItem(`profile_${this.currentUser.id}`, JSON.stringify(this.userProfile));
    this.applyProfileUI();
    
    this.saveProfileBtn.style.background = "var(--success)";
    this.saveProfileBtn.textContent = "STATION SYNCHRONIZED";
    setTimeout(() => {
       this.saveProfileBtn.style.background = "var(--primary)";
       this.saveProfileBtn.textContent = "Synchronize Profile";
    }, 2000);
  }

  private async loadArbiters() {
    const arbiters = [
      { id: 'alpha', name: "Node Alpha", status: "Available", color: "#FF2D55" },
      { id: 'beta', name: "Node Beta", status: "Streaming", color: "#007AFF" },
      { id: 'gamma', name: "Node Gamma", status: "Active", color: "#AF52DE" }
    ];
    
    this.peopleList.innerHTML = arbiters.map(a => `
      <div class="chat-item" data-id="${a.id}">
        <div class="avatar-main" style="background:${a.color}; border-radius: 18px;">${a.name[5]}</div>
        <div class="chat-info">
          <span class="chat-name">${a.name}</span>
          <span class="last-msg">${a.status}</span>
        </div>
      </div>
    `).join('');

    this.peopleList.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id')!;
        if (this.selectedArbiters.has(id)) {
          this.selectedArbiters.delete(id);
          item.classList.remove('selected');
        } else {
          this.selectedArbiters.add(id);
          item.classList.add('selected');
        }
        this.initGroupCallBtn.classList.toggle('hidden', this.selectedArbiters.size === 0);
      });
    });
  }

  private async loadMessages() {
    this.messageContainer.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text-dim); margin-bottom:20px;">STATION ARCHIVE ACCESSED</p>';
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(20);
    if (data) data.forEach(m => this.addMessageToUI(m.content, m.sender_id === this.currentUser.id ? 'sent' : 'received'));
  }

  private async loadCallHistory() {
    const { data } = await supabase.from('call_records').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('callHistory')!;
    container.innerHTML = data?.map(c => `
      <div class="chat-item">
        <div class="avatar-main" style="background:var(--surface); color:var(--text-dim); border-radius: 14px;"><i class="fas fa-file-shield"></i></div>
        <div class="chat-info">
          <span class="chat-name">${c.room}</span>
          <span class="last-msg">${new Date(c.created_at).toLocaleString()}</span>
        </div>
      </div>
    `).join('') || '<p style="padding:40px; text-align:center; opacity:0.4; font-size:14px;">Archive empty.</p>';
  }

  private async handleLogout() {
    await supabase.auth.signOut();
    location.reload();
  }

  private joinSyncRoom(roomId: string) {
    this.syncRoomChannel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false } }
    })
    .on('broadcast', { event: 'transcription' }, ({ payload }) => {
      this.renderTranscription(payload as TranscriptionMessage);
    })
    .subscribe();
  }

  private broadcastTranscription(text: string, translatedText?: string, isFinal: boolean = false) {
    if (!this.syncRoomChannel) return;
    this.syncRoomChannel.send({
      type: 'broadcast',
      event: 'transcription',
      payload: {
        userId: this.currentUser.id,
        userName: this.userProfile.displayName || "Arbiter",
        userColor: this.userProfile.avatarColor,
        text,
        translatedText,
        isFinal
      }
    });
  }

  private renderTranscription(msg: TranscriptionMessage) {
    const { userId, userName, userColor, text, translatedText } = msg;
    this.highlightSpeaker(userId);
    
    let lastLine = this.transcriptionStream.lastElementChild as HTMLElement;
    let targetLine: HTMLElement | null = null;
    
    if (lastLine && lastLine.getAttribute('data-speaker-id') === userId) {
      targetLine = lastLine;
    } else {
      targetLine = document.createElement('div');
      targetLine.className = 'transcript-line';
      targetLine.setAttribute('data-speaker-id', userId);
      targetLine.style.setProperty('--line-color', userColor);
      targetLine.innerHTML = `
        <span class="transcript-speaker">${userName}</span>
        <div class="transcript-content"></div>
        <div class="transcript-translated"></div>
      `;
      this.transcriptionStream.appendChild(targetLine);
    }
    
    const contentEl = targetLine.querySelector('.transcript-content')!;
    const transEl = targetLine.querySelector('.transcript-translated')!;
    
    contentEl.textContent = text;
    if (translatedText) {
      transEl.textContent = translatedText;
      transEl.classList.remove('hidden');
    } else {
      transEl.textContent = "";
      transEl.classList.add('hidden');
    }
    
    this.transcriptionStream.scrollTop = this.transcriptionStream.scrollHeight;
  }

  private highlightSpeaker(speakerId: string) {
    if (this.activeSpeakerId && this.activeSpeakerId !== speakerId) {
       this.clearSpeakerHighlight(this.activeSpeakerId);
    }
    this.activeSpeakerId = speakerId;
    if (speakerId === this.currentUser.id) {
       this.localVideoCard.classList.add('speaking');
       if (this.isFocusMode) this.applyFocus(this.localVideoCard);
    } else {
       const remoteCard = document.querySelector(`.video-card[data-arbiter-id="${speakerId}"]`) as HTMLElement;
       if (remoteCard) {
         remoteCard.classList.add('speaking');
         if (this.isFocusMode) this.applyFocus(remoteCard);
       }
    }
    if (this.speakerHandoffTimeout) clearTimeout(this.speakerHandoffTimeout);
    this.speakerHandoffTimeout = setTimeout(() => {
      this.clearSpeakerHighlight(speakerId);
      this.activeSpeakerId = null;
    }, 3000);
  }

  private clearSpeakerHighlight(speakerId: string) {
    if (speakerId === this.currentUser.id) {
       this.localVideoCard.classList.remove('speaking');
    } else {
       const remoteCard = document.querySelector(`.video-card[data-arbiter-id="${speakerId}"]`);
       if (remoteCard) remoteCard.classList.remove('speaking');
    }
  }

  private applyFocus(element: HTMLElement) {
    document.querySelectorAll('.video-card').forEach(card => card.classList.remove('focused'));
    element.classList.add('focused');
  }

  private toggleFocusMode() {
    this.isFocusMode = !this.isFocusMode;
    this.focusSpeakerBtn.classList.toggle('active', this.isFocusMode);
    if (!this.isFocusMode) {
      document.querySelectorAll('.video-card').forEach(card => card.classList.remove('focused'));
    } else if (this.activeSpeakerId) {
      this.highlightSpeaker(this.activeSpeakerId);
    }
  }

  private async startCall(isGroup = false) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      this.localVideo.srcObject = this.localStream;
      this.callOverlay.classList.remove('hidden');
      const roomId = isGroup ? `group-${Date.now()}` : `direct-${this.currentUser.id}`;
      this.joinSyncRoom(roomId);
      this.callParticipantsLabel.textContent = isGroup ? `${this.selectedArbiters.size + 1} Nodes Syncing` : `Direct Peer Link`;
      await this.initGeminiSync();
    } catch (e) { alert("Visual sync failed: Camera access denied."); }
  }

  private async initGeminiSync() {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const sessionPromise = this.ai.live.connect({
      model: this.currentModel,
      config: { 
        responseModalities: [Modality.AUDIO], 
        inputAudioTranscription: {},
        outputAudioTranscription: {} 
      },
      callbacks: {
        onopen: () => this.streamAudio(sessionPromise),
        onmessage: async (msg: LiveServerMessage) => {
          if (msg.serverContent?.inputTranscription) {
            const text = msg.serverContent.inputTranscription.text;
            let trans = "";
            if (this.isAutoTranslateEnabled) {
              trans = await this.translateText(text, this.targetLanguage);
            }
            this.renderTranscription({
              userId: this.currentUser.id,
              userName: this.userProfile.displayName || "You",
              userColor: this.userProfile.avatarColor,
              text,
              translatedText: trans,
              isFinal: false
            });
            this.broadcastTranscription(text, trans, false);
          }
        }
      }
    });
    this.liveSession = await sessionPromise;
  }

  private streamAudio(sessionPromise: Promise<any>) {
    if (!this.localStream || !this.audioContext) return;
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (this.isMuted) return;
      const data = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
      const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
      sessionPromise.then(s => s.sendRealtimeInput({ media: { data: b64, mimeType: 'audio/pcm;rate=16000' } }));
    };
    source.connect(processor);
    processor.connect(this.audioContext.destination);
  }

  private async translateText(text: string, target: string) {
    try {
      const res = await this.ai.models.generateContent({ 
        model: this.translationModel, 
        contents: `Translate to ${target}, output only the text: "${text}"` 
      });
      return res.text || "";
    } catch (e) { return ""; }
  }

  private async endCall() {
    this.callOverlay.classList.add('hidden');
    this.localStream?.getTracks().forEach(t => t.stop());
    this.liveSession?.close();
    this.audioContext?.close();
    this.transcriptionStream.innerHTML = "";
  }

  private async sendMessage() {
    const text = this.msgInput.value.trim();
    if (!text) return;
    this.addMessageToUI(text, 'sent');
    this.msgInput.value = '';
    await supabase.from('messages').insert([{ content: text, sender_id: this.currentUser.id }]);
  }

  private async toggleSeamlessTranscription() {
    const btn = document.getElementById('seamlessTranscriptionBtn')!;
    if (this.seamlessSession) {
      this.seamlessSession.close();
      this.seamlessSession = null;
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const promise = this.ai.live.connect({
        model: this.currentModel,
        config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {} },
        callbacks: {
          onopen: () => this.streamAudio(promise),
          onmessage: (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) this.msgInput.value += msg.serverContent.inputTranscription.text + " ";
          }
        }
      });
      this.seamlessSession = await promise;
    }
  }

  private switchView(id: string) {
    this.views.forEach(v => v.classList.toggle('active', v.id === id));
    this.chatDetail.classList.add('hidden');
  }

  private setAccentColor(color: string) {
    document.documentElement.style.setProperty('--primary', color);
    localStorage.setItem('accentColor', color);
    this.userProfile.avatarColor = color; 
    this.colorSwatches.forEach(swatch => {
      swatch.classList.toggle('active', swatch.getAttribute('data-color') === color);
    });
    this.applyProfileUI();
  }

  private loadPersonalization() {
    const accent = localStorage.getItem('accentColor');
    if (accent) this.setAccentColor(accent);
    const lang = localStorage.getItem('targetLanguage');
    if (lang) {
      this.targetLanguage = lang;
      this.targetLangSelect.value = lang;
    }
    const model = localStorage.getItem('orbit_active_model');
    if (model) {
      this.currentModel = model;
      this.llmModelSelect.value = model;
      this.activeModelLabel.textContent = `Model: ${model.split('-')[1]} ${model.split('-')[2] || ''}`;
    }
  }

  private addMessageToUI(text: string, type: string) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<div class="msg-bubble">${text}</div>`;
    this.messageContainer.appendChild(div);
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }

  private toggleMic(btn: HTMLButtonElement) {
    this.isMuted = !this.isMuted;
    btn.innerHTML = `<i class="fas fa-microphone${this.isMuted ? '-slash' : ''}"></i>`;
    btn.classList.toggle('danger', this.isMuted);
  }

  private toggleCam(btn: HTMLButtonElement) {
    this.isCamOff = !this.isCamOff;
    btn.innerHTML = `<i class="fas fa-video${this.isCamOff ? '-slash' : ''}"></i>`;
    btn.classList.toggle('danger', this.isCamOff);
  }
}

document.addEventListener('DOMContentLoaded', () => new OrbitStation());
