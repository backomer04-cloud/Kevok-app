import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

const SUPABASE_URL = 'https://rbmfidmnomqyzgvlqome.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nQQMzbntNL2Bu346iW0HhQ_JVkilrE_';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const timeAgo = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) return 'Az önce';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} dk önce`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} saat önce`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} gün önce`;
};

const isOnline = (lastSeenString) => {
  if (!lastSeenString) return false;
  const now = new Date();
  const lastSeen = new Date(lastSeenString);
  const diffInSeconds = Math.floor((now - lastSeen) / 1000);
  return diffInSeconds < 120;
};

export default function App() {
  const [appStage, setAppStage] = useState('auth'); 
  const [authTab, setAuthTab] = useState('login'); 
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [locationVal, setLocationVal] = useState('');
  const [genderVal, setGenderVal] = useState('Belirtilmemiş');

  const [user, setUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('home'); 
  const [selectedChat, setSelectedChat] = useState(null); 
  const [viewingProfile, setViewingProfile] = useState(false); 
  const [messageText, setMessageText] = useState('');
  
  // --- YAZIYOR... STATE'İ ---
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const typingChannelRef = useRef(null);

  const messagesEndRef = useRef(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3500);
  };

  const [chats, setChats] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]); 
  const [allUsers, setAllUsers] = useState([]); 
  const [messages, setMessages] = useState([]);

  // --- TAM EKRAN YÖNETİMİ ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    const tryAutoFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('click', tryAutoFullscreen, { once: true });

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserData(session.user.id, session.user.email);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await loadUserData(session.user.id, session.user.email);
      } else {
        setUser(null);
        setAppStage('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(async () => {
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id);
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const loadUserData = async (userId, userEmail) => {
    const { data: pData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId);

    const currentUserObj = {
      id: userId,
      email: userEmail,
      fullName: pData?.full_name || 'Kevok Üyesi',
      username: pData?.username || 'kullanici',
      location: pData?.location || '',
      gender: pData?.gender || 'Belirtilmemiş'
    };

    setUser(currentUserObj);
    setAppStage('main');
    await fetchAppData(userId);
  };

  const fetchAppData = async (currentUserId) => {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId);

    if (profilesData) {
      setAllUsers(profilesData.map(u => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        birthDate: u.birth_date || 'Belirtilmemiş',
        location: u.location || 'Konum yok',
        gender: u.gender || 'Belirtilmemiş',
        lastSeen: u.last_seen
      })));
    }

    const { data: reqData } = await supabase
      .from('friend_requests')
      .select(`id, sender_id, created_at, profiles:sender_id (id, username, full_name, location, last_seen)`)
      .eq('receiver_id', currentUserId)
      .eq('status', 'pending');

    if (reqData) setPendingRequests(reqData);

    const { data: convsData } = await supabase
      .from('conversations')
      .select(`
        id, user1_id, user2_id,
        user1:user1_id (id, full_name, username, birth_date, location, gender, last_seen),
        user2:user2_id (id, full_name, username, birth_date, location, gender, last_seen)
      `)
      .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

    let activeChats = [];
    if (convsData) {
      convsData.forEach(conv => {
        const isUser1 = conv.user1_id === currentUserId;
        const friend = isUser1 ? conv.user2 : conv.user1;

        if (friend) {
          const onlineStatus = isOnline(friend.last_seen);
          activeChats.push({
            id: friend.id,
            conversationId: conv.id,
            name: friend.full_name,
            username: friend.username || 'kullanici',
            birthDate: friend.birth_date || 'Belirtilmemiş',
            location: friend.location || 'Konum yok',
            gender: friend.gender || 'Belirtilmemiş',
            avatar: friend.full_name.charAt(0),
            lastMessage: onlineStatus ? 'Çevrimiçi 🟢' : `Son görülme: ${timeAgo(friend.last_seen)}`,
            time: '',
            online: onlineStatus,
            unread: 0
          });
        }
      });
    }
    setChats(activeChats);
  };

  const getOrCreateConversation = async (userId1, userId2) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`)
      .single();

    if (existing) return existing.id;

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert([{ user1_id: userId1, user2_id: userId2 }])
      .select('id')
      .single();

    if (!error && newConv) return newConv.id;
    return null;
  };

  const handleSendInvite = async (targetUser) => {
    if (!user?.id) return;
    const { error } = await supabase.from('friend_requests').insert([
      { sender_id: user.id, receiver_id: targetUser.id, status: 'pending' }
    ]);
    if (error) showToast('Bu kullanıcıya zaten davet gönderilmiş.', 'error');
    else showToast(`${targetUser.fullName} kişisine davetiye gönderildi!`, 'success');
  };

  const handleAcceptInvite = async (requestItem) => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestItem.id);

    if (error) { showToast('İstek kabul edilemedi.', 'error'); return; }

    await getOrCreateConversation(user.id, requestItem.sender_id);
    showToast(`${requestItem.profiles.full_name} ile arkadaş oldunuz!`, 'success');
    await fetchAppData(user.id);
    setPendingRequests(pendingRequests.filter(r => r.id !== requestItem.id));
  };

  const handleRemoveFriend = async (friendId) => {
    if (!user?.id) return;
    await supabase.from('friend_requests').delete().or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`);
    await supabase.from('conversations').delete().or(`and(user1_id.eq.${user.id},user2_id.eq.${friendId}),and(user1_id.eq.${friendId},receiver_id.eq.${user.id})`);

    showToast('Arkadaşlıktan çıkarıldı.', 'info');
    setViewingProfile(false);
    setSelectedChat(null);
    setCurrentScreen('home');
    await fetchAppData(user.id);
  };

  // --- REALTIME SOHBET, OKUNDU BİLGİSİ VE YAZIYOR... YÖNETİMİ ---
  useEffect(() => {
    if (!selectedChat?.conversationId || !user?.id) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedChat.conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data.map(m => ({
          id: m.id,
          sender: m.sender_id === user.id ? 'me' : 'them',
          text: m.content,
          isRead: m.is_read,
          time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })));

        // Gelen okunmamış mesajları okundu olarak işaretle
        await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('conversation_id', selectedChat.conversationId)
          .neq('sender_id', user.id);
      }
    };

    fetchMessages();

    // Broadcast kanal ile Yazıyor... ve Yeni Mesaj Takibi
    const channel = supabase.channel(`room-${selectedChat.conversationId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedChat.conversationId}` }, async (payload) => {
        const newMessage = payload.new;
        setMessages((prev) => [
          ...prev,
          {
            id: newMessage.id,
            sender: newMessage.sender_id === user.id ? 'me' : 'them',
            text: newMessage.content,
            isRead: newMessage.is_read,
            time: new Date(newMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);

        if (newMessage.sender_id !== user.id) {
          await supabase.from('messages').update({ is_read: true }).eq('id', newMessage.id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedChat.conversationId}` }, (payload) => {
        const updatedMsg = payload.new;
        setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? { ...m, isRead: updatedMsg.is_read } : m));
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId !== user.id) {
          setIsTyping(payload.payload.isTyping);
        }
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => { 
      supabase.removeChannel(channel); 
      setIsTyping(false);
    };
  }, [selectedChat, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Yazı yazıldığında karşı tarafa "Yazıyor..." sinyali gönder
  const handleInputChange = (e) => {
    setMessageText(e.target.value);

    if (typingChannelRef.current && user) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user.id, isTyping: true }
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        typingChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: user.id, isTyping: false }
        });
      }, 2000);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedChat?.conversationId || !user) return;

    if (typingChannelRef.current) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user.id, isTyping: false }
      });
    }

    const textPayload = messageText;
    setMessageText('');

    const { error } = await supabase.from('messages').insert([
      { conversation_id: selectedChat.conversationId, sender_id: user.id, content: textPayload, is_read: false }
    ]);

    if (error) showToast('Mesaj gönderilemedi: ' + error.message, 'error');
  };

  const handleFetchLocation = () => {
    if (!navigator.geolocation) { showToast('Konum desteklenmiyor.', 'error'); return; }
    showToast('Konum alınıyor...', 'info');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=10&addressdetails=1`, {
            headers: { 'Accept-Language': 'tr' }
          });
          const data = await res.json();
          const city = data?.address?.province || data?.address?.city || 'Türkiye';
          if (user) setUser({ ...user, location: city });
          else setLocationVal(city);
          showToast(`Konum bulundu: ${city}`, 'success');
        } catch { showToast('Konum adı çözülemedi.', 'error'); }
      },
      () => showToast('Konum izni reddedildi.', 'error')
    );
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (authTab === 'register') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { showToast('Kayıt hatası: ' + error.message, 'error'); return; }

      if (data.user) {
        await supabase.from('profiles').insert([{
          id: data.user.id,
          username: username || 'kullanici',
          full_name: fullName || 'Kevok Üyesi',
          birth_date: birthDate || null,
          location: locationVal || '',
          gender: genderVal || 'Belirtilmemiş',
          last_seen: new Date().toISOString()
        }]);

        showToast('Kayıt başarılı!', 'success');
        await loadUserData(data.user.id, email);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { showToast('Giriş başarısız: ' + error.message, 'error'); return; }
      if (data.user) {
        showToast('Giriş başarılı!', 'success');
        await loadUserData(data.user.id, data.user.email);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAppStage('auth');
    showToast('Oturum kapatıldı.', 'info');
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    const { error } = await supabase.from('profiles').update({
      full_name: user.fullName,
      username: user.username,
      birth_date: user.birthDate,
      location: user.location,
      gender: user.gender
    }).eq('id', user.id);

    if (error) showToast('Güncelleme hatası', 'error');
    else showToast('Profil güncellendi!', 'success');
  };

  return (
    <div className="app-container desktop-layout-root">
      
      {/* KÖŞEDEKİ TAM EKRAN BUTONU (Yalnızca Ana Ekranda Görünür, Sohbet İçinde Kaybolur) */}
      {!selectedChat && currentScreen === 'home' && (
        <button 
          className="global-fullscreen-fab" 
          onClick={toggleFullscreen} 
          title={isFullscreen ? "Normal Ekrana Dön" : "Tam Ekran Yap"}
        >
          {isFullscreen ? '🗗' : '⛶'}
        </button>
      )}

      <div className={`kevok-toast ${toast.show ? 'show' : ''} toast-${toast.type}`}>
        <span className="toast-icon">{toast.type === 'success' ? '✨' : '⚠️'}</span>
        <p>{toast.message}</p>
      </div>

      {appStage === 'auth' ? (
        <div className="auth-modal-overlay">
          <div className="auth-modal-card">
            <div className="auth-header-brand">
              <div className="brand-dove-icon">🕊️</div>
              <h2>KEVOK</h2>
              <p>Özgür ve Modern İletişim Ağı</p>
            </div>
            <div className="auth-tabs">
              <button className={`tab-btn ${authTab === 'login' ? 'active' : ''}`} onClick={() => setAuthTab('login')}>Giriş Yap</button>
              <button className={`tab-btn ${authTab === 'register' ? 'active' : ''}`} onClick={() => setAuthTab('register')}>Kayıt Ol</button>
            </div>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authTab === 'register' && (
                <>
                  <div className="input-group">
                    <label>Ad Soyad</label>
                    <input type="text" placeholder="Ömer Koçoğlu" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Kullanıcı Adı</label>
                    <input type="text" placeholder="omerkocoglu" value={username} onChange={(e) => setUsername(e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Doğum Tarihi</label>
                    <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Konum (İl / İlçe)</label>
                    <div style={{display: 'flex', gap: '8px'}}>
                      <input type="text" placeholder="Kadıköy, İstanbul" value={locationVal} onChange={(e) => setLocationVal(e.target.value)} style={{flex: 1}} />
                      <button type="button" className="location-btn" onClick={handleFetchLocation}>📍</button>
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Cinsiyet</label>
                    <select value={genderVal} onChange={(e) => setGenderVal(e.target.value)}>
                      <option value="Belirtilmemiş">Belirtilmemiş</option>
                      <option value="Erkek">Erkek</option>
                      <option value="Kadın">Kadın</option>
                    </select>
                  </div>
                </>
              )}
              <div className="input-group">
                <label>E-posta</label>
                <input type="email" placeholder="ornek@domain.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Şifre</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="submit-btn">{authTab === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}</button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* SOL SÜTUN */}
          <div className={`sidebar-panel ${selectedChat && window.innerWidth <= 768 ? 'mobile-hidden' : ''}`}>
            <div className="sidebar-header">
              <div className="sidebar-brand">
                <span className="brand-icon-mini">🕊️</span>
                <h1>Kevok</h1>
              </div>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                <button 
                  className="icon-btn" 
                  onClick={() => setCurrentScreen('requests')} 
                  title="Gelen Arkadaşlık İstekleri"
                  style={{position: 'relative'}}
                >
                  📥
                  {pendingRequests.length > 0 && (
                    <span className="notification-badge-red">{pendingRequests.length}</span>
                  )}
                </button>
                <button className="icon-btn" onClick={() => setCurrentScreen('settings')} title="Ayarlar">
                  ⚙️
                </button>
              </div>
            </div>

            <div className="search-box-container">
              <input type="text" placeholder="Sohbetlerde ara..." className="sidebar-search-input" />
            </div>

            <div className="chat-list-scroll">
              <div className="section-title-label">Aktif Sohbetler</div>
              {chats.length === 0 ? (
                <p style={{color: '#64748b', fontSize: '0.85rem', padding: '10px'}}>Henüz aktif sohbet yok. Arkadaş eklemek için sağ alttaki (+) butonuna basın.</p>
              ) : (
                chats.map((chat) => (
                  <div 
                    key={chat.id} 
                    className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                    onClick={() => { setSelectedChat(chat); setViewingProfile(false); setCurrentScreen('chat'); }}
                  >
                    <div className="chat-avatar" style={{position: 'relative'}}>
                      {chat.avatar}
                      {chat.online && <span className="online-dot-indicator"></span>}
                    </div>
                    <div className="chat-info">
                      <div className="chat-item-top">
                        <h3>{chat.name}</h3>
                        <span className="chat-time">{chat.time}</span>
                      </div>
                      <p className="chat-last-msg">{chat.lastMessage}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="fab-container" onClick={() => setCurrentScreen('add-friend')} title="Arkadaş Keşfet">
              <div className="fab-button">+</div>
            </div>
          </div>

          {/* SAĞ İÇERİK ALANI */}
          <div className={`content-panel ${!selectedChat && window.innerWidth <= 768 && currentScreen === 'home' ? 'mobile-hidden' : ''}`}>
            
            {currentScreen === 'chat' && selectedChat ? (
              
              viewingProfile ? (
                <div className="sub-screen-container">
                  <div className="sub-screen-header">
                    <button className="back-arrow-btn" onClick={() => setViewingProfile(false)}>←</button>
                    <h2>Kullanıcı Profili</h2>
                  </div>
                  <div className="sub-screen-scroll-body">
                    <div className="profile-view-card">
                      <div className="profile-view-avatar-wrapper">
                        <div className="profile-big-avatar">{selectedChat.avatar}</div>
                        {selectedChat.online && <span className="profile-status-badge">Çevrimiçi</span>}
                      </div>
                      
                      <h2 className="profile-view-name">{selectedChat.name}</h2>
                      <p className="profile-view-username">@{selectedChat.username}</p>

                      <div className="profile-info-grid">
                        <div className="profile-info-card-item">
                          <span className="info-icon">🎂</span>
                          <div className="info-details">
                            <span className="info-label">Doğum Tarihi</span>
                            <span className="info-value">{selectedChat.birthDate}</span>
                          </div>
                        </div>

                        <div className="profile-info-card-item">
                          <span className="info-icon">📍</span>
                          <div className="info-details">
                            <span className="info-label">Konum</span>
                            <span className="info-value">{selectedChat.location}</span>
                          </div>
                        </div>

                        <div className="profile-info-card-item">
                          <span className="info-icon">⚥</span>
                          <div className="info-details">
                            <span className="info-label">Cinsiyet</span>
                            <span className="info-value">{selectedChat.gender}</span>
                          </div>
                        </div>
                      </div>

                      <button 
                        className="logout-btn" 
                        onClick={() => {
                          if (window.confirm(`${selectedChat.name} kişisini arkadaşlıktan çıkarmak istiyor musunuz?`)) {
                            handleRemoveFriend(selectedChat.id);
                          }
                        }} 
                        style={{marginTop: '30px'}}
                      >
                        🗑️ Arkadaşlıktan Çıkar
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chat-room-container">
                  <div className="chat-room-header">
                    <button className="back-arrow-btn" onClick={() => { setSelectedChat(null); setCurrentScreen('home'); }}>←</button>
                    
                    <div className="chat-room-profile-click" onClick={() => setViewingProfile(true)} title="Profili Görüntüle">
                      <div className="chat-room-avatar-large">
                        {selectedChat.avatar}
                        {selectedChat.online && <span className="online-dot-indicator-large"></span>}
                      </div>
                      <div className="chat-room-user-info">
                        <h2>{selectedChat.name}</h2>
                        <span>{isTyping ? 'yazıyor...' : (selectedChat.online ? 'Çevrimiçi 🟢' : selectedChat.lastMessage)}</span>
                      </div>
                    </div>

                    <div style={{display: 'flex', gap: '8px', marginLeft: 'auto'}}>
                      <button className="icon-btn" onClick={() => showToast('Sesli arama özelliği yakında aktif olacaktır 🕊️', 'info')} title="Sesli Ara">
                        📞
                      </button>
                      <button className="icon-btn" onClick={() => showToast('Görüntülü arama özelliği yakında aktif olacaktır 🕊️', 'info')} title="Görüntülü Ara">
                        📹
                      </button>
                    </div>
                  </div>

                  <div className="messages-stream">
                    {messages.length === 0 ? (
                      <div style={{textAlign: 'center', color: '#64748b', marginTop: '40px', fontSize: '0.9rem'}}>
                        Henüz mesaj yok. İlk mesajı göndererek sohbeti başlatın! 🕊️
                      </div>
                    ) : (
                       messages.map((msg) => (
                        <div key={msg.id} className={`message-bubble ${msg.sender === 'me' ? 'msg-me' : 'msg-them'}`}>
                          <p>{msg.text}</p>
                          <div className="msg-footer">
                            <span className="msg-time">{msg.time}</span>
                            {msg.sender === 'me' && (
                              <span className={`msg-ticks ${msg.isRead ? 'read' : ''}`}>
                                {msg.isRead ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      ))


                    )}
                    {/* YAZIYOR... ANİMASYON BALONU */}
                    {isTyping && (
                      <div className="message-bubble msg-them typing-bubble">
                        <div className="typing-dots">
                          <span></span><span></span><span></span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form className="message-input-form" onSubmit={handleSendMessage}>
                    <button type="button" className="media-attach-btn" onClick={() => showToast('Fotoğraf ekleme yakında aktif olacaktır 🕊️', 'info')} title="Fotoğraf Çek / Ekle">
                      📷
                    </button>
                    <button type="button" className="media-attach-btn" onClick={() => showToast('Dosya yükleme yakında aktif olacaktır 🕊️', 'info')} title="Dosya Seç">
                      📎
                    </button>
                    <input type="text" placeholder="Mesaj yazın..." value={messageText} onChange={handleInputChange} />
                    <button type="submit" className="send-msg-btn">➤</button>
                  </form>
                </div>
              )

            ) : currentScreen === 'requests' ? (
              
              <div className="sub-screen-container">
                <div className="sub-screen-header">
                  <button className="back-arrow-btn" onClick={() => setCurrentScreen('home')}>←</button>
                  <h2>Gelen İstekler ({pendingRequests.length})</h2>
                </div>
                <div className="sub-screen-scroll-body">
                  {pendingRequests.length === 0 ? (
                    <p style={{color: '#94a3b8', padding: '20px'}}>Bekleyen arkadaşlık isteğiniz yok.</p>
                  ) : (
                    pendingRequests.map((req) => (
                      <div key={req.id} className="user-discovery-card">
                        <div className="discovery-avatar">{req.profiles?.full_name?.charAt(0) || 'K'}</div>
                        <div className="discovery-info">
                          <h4>{req.profiles?.full_name} <span>@{req.profiles?.username}</span></h4>
                          <p>📍 {req.profiles?.location || 'Konum yok'} • <span style={{color: '#38bdf8'}}>{timeAgo(req.created_at)}</span></p>
                        </div>
                        <button className="invite-action-btn" style={{background: '#4ade80', color: '#030712'}} onClick={() => handleAcceptInvite(req)}>Kabul Et</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            ) : currentScreen === 'settings' ? (
              
              <div className="sub-screen-container">
                <div className="sub-screen-header">
                  <button className="back-arrow-btn" onClick={() => setCurrentScreen('home')}>←</button>
                  <h2>Profil ve Ayarlar</h2>
                </div>
                <div className="sub-screen-scroll-body">
                  <div className="settings-card-content">
                    <div className="profile-big-avatar">{user?.fullName?.charAt(0) || 'K'}</div>
                    <h3>{user?.fullName}</h3>
                    <p className="profile-username">@{user?.username}</p>

                    <form className="profile-edit-form" onSubmit={handleProfileUpdate}>
                      <div className="input-group">
                        <label>Ad Soyad</label>
                        <input type="text" value={user?.fullName || ''} onChange={(e) => setUser({...user, fullName: e.target.value})} />
                      </div>
                      <div className="input-group">
                        <label>Kullanıcı Adı</label>
                        <input type="text" value={user?.username || ''} onChange={(e) => setUser({...user, username: e.target.value})} />
                      </div>
                      <div className="input-group">
                        <label>Konum</label>
                        <div style={{display: 'flex', gap: '8px'}}>
                          <input type="text" value={user?.location || ''} onChange={(e) => setUser({...user, location: e.target.value})} style={{flex: 1}} />
                          <button type="button" className="location-btn" onClick={handleFetchLocation}>📍</button>
                        </div>
                      </div>
                      <button type="submit" className="submit-btn" style={{marginTop: '10px'}}>Değişiklikleri Kaydet</button>
                    </form>
                    <button className="logout-btn" onClick={handleLogout}>Oturumu Kapat</button>
                  </div>
                </div>
              </div>

            ) : currentScreen === 'add-friend' ? (
              
              <div className="sub-screen-container">
                <div className="sub-screen-header">
                  <button className="back-arrow-btn" onClick={() => setCurrentScreen('home')}>←</button>
                  <h2>Yeni Arkadaşlar Keşfet</h2>
                </div>
                <div className="sub-screen-scroll-body">
                  <p className="section-desc">Kevok ağındaki diğer kullanıcılar:</p>
                  {allUsers.length === 0 ? (
                    <p style={{color: '#94a3b8', padding: '20px'}}>Başka kullanıcı bulunamadı.</p>
                  ) : (
                    allUsers.map((u) => (
                      <div key={u.id} className="user-discovery-card">
                        <div className="discovery-avatar">
                          {u.fullName.charAt(0)}
                          {isOnline(u.lastSeen) && <span className="online-dot-indicator"></span>}
                        </div>
                        <div className="discovery-info">
                          <h4>{u.fullName} <span>@{u.username}</span></h4>
                          <p>📍 {u.location} {isOnline(u.lastSeen) ? '• 🟢 Çevrimiçi' : `• ${timeAgo(u.lastSeen)}`}</p>
                        </div>
                        <button className="invite-action-btn" onClick={() => handleSendInvite(u)}>Davet Et</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            ) : (
              
              <div className="empty-welcome-state">
                <div className="welcome-dove-logo">🕊️</div>
                <h2>Kevok İletişim Merkezine Hoş Geldiniz</h2>
                <p>Sol üstteki gelen kutusundan istekleri kabul edin veya sol alttaki (+) butonundan arkadaş keşfedin.</p>
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
