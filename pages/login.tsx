// pages/login.tsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  Eye,
  EyeOff,
  Shield,
  MapPin,
  ClipboardCheck,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Sun,
  Moon,
} from 'lucide-react';

// ─── Theme Tokens ─────────────────────────────────────────────────
const darkTheme = {
  pageBg: '#0a0f1e',
  gradientBg: 'linear-gradient(to bottom right, #0a0f1e, #0d1526, #0f1a30)',
  glow1: 'rgba(6,182,212,0.05)',
  glow2: 'rgba(59,130,246,0.05)',
  glow3: 'rgba(6,182,212,0.02)',
  cardBg: 'rgba(17,24,39,0.80)',
  cardBorder: 'rgba(255,255,255,0.06)',
  cardGradientBorder: 'linear-gradient(to bottom, rgba(6,182,212,0.20), rgba(6,182,212,0.05), transparent)',
  topAccent: 'linear-gradient(to right, transparent, #22d3ee, transparent)',
  particleColor: '6, 182, 212',
  gridColor: 'rgba(6,182,212,0.3)',
  floatingIconColor: 'text-cyan-400',
  title: 'text-white',
  subtitle: 'text-gray-500',
  labelColor: 'text-gray-400',
  inputBg: 'rgba(255,255,255,0.03)',
  inputBorder: 'rgba(255,255,255,0.06)',
  inputFocusBg: 'rgba(255,255,255,0.05)',
  inputFocusBorder: 'rgba(6,182,212,0.30)',
  inputText: 'text-white',
  inputPlaceholder: 'text-gray-600',
  iconDefault: 'text-gray-500',
  iconFocus: 'text-cyan-400',
  eyeBtn: 'text-gray-500 hover:text-cyan-400',
  badgeBg: 'rgba(6,182,212,0.08)',
  badgeBorder: 'rgba(6,182,212,0.20)',
  badgeText: 'text-cyan-300',
  badgeIcon: 'text-cyan-400',
  footerBorder: 'rgba(255,255,255,0.04)',
  footerText: 'text-gray-600',
  footerDot: 'text-gray-700',
  bottomText: 'text-gray-600',
  errorBg: 'rgba(239,68,68,0.08)',
  errorBorder: 'rgba(239,68,68,0.20)',
  errorText: 'text-red-400',
  toggleBg: 'rgba(255,255,255,0.05)',
  toggleBorder: 'rgba(255,255,255,0.10)',
  toggleText: 'text-gray-400',
  toggleHover: 'hover:bg-white/10',
};

const lightTheme = {
  pageBg: '#f0f4ff',
  gradientBg: 'linear-gradient(to bottom right, #e8f0fe, #f0f4ff, #e6f7ff)',
  glow1: 'rgba(6,182,212,0.10)',
  glow2: 'rgba(59,130,246,0.10)',
  glow3: 'rgba(6,182,212,0.05)',
  cardBg: 'rgba(255,255,255,0.85)',
  cardBorder: 'rgba(6,182,212,0.15)',
  cardGradientBorder: 'linear-gradient(to bottom, rgba(6,182,212,0.35), rgba(6,182,212,0.10), transparent)',
  topAccent: 'linear-gradient(to right, transparent, #06b6d4, transparent)',
  particleColor: '6, 182, 212',
  gridColor: 'rgba(6,182,212,0.4)',
  floatingIconColor: 'text-cyan-500',
  title: 'text-gray-900',
  subtitle: 'text-gray-500',
  labelColor: 'text-gray-500',
  inputBg: 'rgba(6,182,212,0.03)',
  inputBorder: 'rgba(6,182,212,0.15)',
  inputFocusBg: 'rgba(6,182,212,0.05)',
  inputFocusBorder: 'rgba(6,182,212,0.40)',
  inputText: 'text-gray-900',
  inputPlaceholder: 'text-gray-400',
  iconDefault: 'text-gray-400',
  iconFocus: 'text-cyan-500',
  eyeBtn: 'text-gray-400 hover:text-cyan-500',
  badgeBg: 'rgba(6,182,212,0.08)',
  badgeBorder: 'rgba(6,182,212,0.25)',
  badgeText: 'text-cyan-700',
  badgeIcon: 'text-cyan-600',
  footerBorder: 'rgba(6,182,212,0.10)',
  footerText: 'text-gray-400',
  footerDot: 'text-gray-300',
  bottomText: 'text-gray-400',
  errorBg: 'rgba(239,68,68,0.06)',
  errorBorder: 'rgba(239,68,68,0.20)',
  errorText: 'text-red-500',
  toggleBg: 'rgba(6,182,212,0.08)',
  toggleBorder: 'rgba(6,182,212,0.20)',
  toggleText: 'text-cyan-700',
  toggleHover: 'hover:bg-cyan-50',
};

// ─── Particle Background Canvas ───────────────────────────────────
function ParticleBackground({ particleColor }: { particleColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; pulse: number;
    }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.pulse += 0.02;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const currentOpacity = p.opacity * (0.5 + 0.5 * Math.sin(p.pulse));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particleColor}, ${currentOpacity})`;
        ctx.fill();

        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x, dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${particleColor}, ${0.08 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [particleColor]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

// ─── Floating Icon Component ──────────────────────────────────────
function FloatingIcon({ icon: Icon, className, delay, colorClass }: {
  icon: any; className: string; delay: string; colorClass: string;
}) {
  return (
    <div
      className={`absolute opacity-10 ${colorClass} animate-float ${className}`}
      style={{ animationDelay: delay }}
    >
      <Icon size={32} />
    </div>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);
  const { loginWithEmail } = useAuth();
  const router = useRouter();

  const t = isDark ? darkTheme : lightTheme;

  useEffect(() => { setMounted(true); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await loginWithEmail(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(6, 182, 212, 0.1); }
          50% { box-shadow: 0 0 40px rgba(6, 182, 212, 0.2); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1); opacity: 0.2; }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        @keyframes grid-scroll {
          0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
          100% { transform: perspective(500px) rotateX(60deg) translateY(40px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-slideUp { animation: slideUp 0.8s ease-out forwards; }
        .animate-fadeIn { animation: fadeIn 1s ease-out forwards; }
        .animate-glow { animation: glow 3s ease-in-out infinite; }
        .animate-shimmer { background-size: 200% auto; animation: shimmer 3s linear infinite; }
      `}</style>

      <div
        className="relative flex items-center justify-center min-h-screen overflow-hidden transition-colors duration-500"
        style={{ background: t.gradientBg }}
      >
        {/* ── Theme Toggle ── */}
        <button
          onClick={() => setIsDark(!isDark)}
          className={`absolute top-5 right-5 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-sm transition-all duration-300 ${t.toggleText} ${t.toggleHover}`}
          style={{ background: t.toggleBg, borderColor: t.toggleBorder.replace('rgba', 'rgba') }}
        >
          {isDark ? (
            <><Sun size={13} /><span>Light</span></>
          ) : (
            <><Moon size={13} /><span>Dark</span></>
          )}
        </button>

        {/* ── Background Layers ── */}
        <div className="absolute inset-0" style={{ background: t.gradientBg }} />

        {/* Animated grid */}
        <div className="absolute inset-0 overflow-hidden opacity-[0.04]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(${t.gridColor} 1px, transparent 1px), linear-gradient(90deg, ${t.gridColor} 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
              animation: 'grid-scroll 8s linear infinite',
            }}
          />
        </div>

        {/* Radial glow spots */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full blur-3xl transition-colors duration-500" style={{ background: t.glow1 }} />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full blur-3xl transition-colors duration-500" style={{ background: t.glow2 }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl transition-colors duration-500" style={{ background: t.glow3 }} />

        <ParticleBackground particleColor={t.particleColor} />

        {/* Floating icons */}
        <FloatingIcon icon={MapPin} className="top-[15%] left-[10%]" delay="0s" colorClass={t.floatingIconColor} />
        <FloatingIcon icon={ClipboardCheck} className="top-[20%] right-[15%]" delay="2s" colorClass={t.floatingIconColor} />
        <FloatingIcon icon={Shield} className="bottom-[25%] left-[8%]" delay="4s" colorClass={t.floatingIconColor} />
        <FloatingIcon icon={MapPin} className="bottom-[15%] right-[10%]" delay="1s" colorClass={t.floatingIconColor} />
        <FloatingIcon icon={ClipboardCheck} className="top-[60%] left-[20%]" delay="3s" colorClass={t.floatingIconColor} />

        {/* ── Login Card ── */}
        <div
          className={`relative z-10 w-full max-w-[440px] mx-4 transition-all duration-1000 ${mounted ? 'animate-slideUp' : 'opacity-0'}`}
        >
          {/* Card glow border */}
          <div
            className="absolute -inset-[1px] rounded-2xl"
            style={{ background: t.cardGradientBorder }}
          />

          <div
            className="relative rounded-2xl backdrop-blur-xl shadow-2xl animate-glow overflow-hidden transition-all duration-500"
            style={{
              background: t.cardBg,
              border: `1px solid ${t.cardBorder}`,
              boxShadow: isDark ? '0 25px 50px rgba(0,0,0,0.4)' : '0 25px 50px rgba(6,182,212,0.08)',
            }}
          >
            {/* Top accent line */}
            <div className="h-[2px] transition-all duration-500" style={{ background: t.topAccent }} />

            <div className="px-8 pt-10 pb-8">
              {/* ── Logo & Title ── */}
              <div className="text-center mb-8">
                <div className="relative inline-flex items-center justify-center mb-5">
                  <div
                    className="absolute w-20 h-20 rounded-full"
                    style={{ background: isDark ? 'rgba(6,182,212,0.10)' : 'rgba(6,182,212,0.12)', animation: 'pulse-ring 3s ease-in-out infinite' }}
                  />
                  <div
                    className="relative w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm transition-all duration-500"
                    style={{
                      background: isDark ? 'linear-gradient(to bottom right, rgba(6,182,212,0.20), rgba(37,99,235,0.20))' : 'linear-gradient(to bottom right, rgba(6,182,212,0.15), rgba(37,99,235,0.15))',
                      border: isDark ? '1px solid rgba(6,182,212,0.20)' : '1px solid rgba(6,182,212,0.30)',
                    }}
                  >
                    <Shield className={`w-8 h-8 ${t.badgeIcon}`} strokeWidth={1.5} />
                  </div>
                </div>

                <h1 className={`text-2xl font-bold tracking-tight transition-colors duration-300 ${t.title}`}>
                  Taskforce
                </h1>
                <p className={`mt-1 text-sm transition-colors duration-300 ${t.subtitle}`}>
                  Feeder & Chronic Points Inspection System — Pune
                </p>
              </div>

              {/* ── Role Badge ── */}
              <div className="flex justify-center mb-8">
                <div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-300"
                  style={{ background: t.badgeBg, border: `1px solid ${t.badgeBorder}` }}
                >
                  <Lock className={`w-3.5 h-3.5 ${t.badgeIcon}`} />
                  <span className={`text-xs font-medium tracking-wide uppercase ${t.badgeText}`}>
                    Authorized Personnel Only
                  </span>
                </div>
              </div>

              {/* ── Login Form ── */}
              <form className="space-y-5" onSubmit={handleLogin}>
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className={`block text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${t.labelColor}`}>
                    Email Address
                  </label>
                  <div
                    className="relative rounded-xl transition-all duration-300"
                    style={focusedField === 'email' ? { boxShadow: `0 0 0 2px rgba(6,182,212,0.30), 0 4px 6px rgba(6,182,212,0.05)` } : {}}
                  >
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Mail
                        className={`transition-colors duration-300 ${focusedField === 'email' ? t.iconFocus : t.iconDefault}`}
                        size={18}
                      />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="admin@pune.in"
                      className={`block w-full pl-11 pr-4 py-3 text-sm rounded-xl focus:outline-none transition-all duration-300 ${t.inputText} ${t.inputPlaceholder}`}
                      style={{
                        background: focusedField === 'email' ? t.inputFocusBg : t.inputBg,
                        border: `1px solid ${focusedField === 'email' ? t.inputFocusBorder : t.inputBorder}`,
                      }}
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <label htmlFor="password" className={`block text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${t.labelColor}`}>
                    Password
                  </label>
                  <div
                    className="relative rounded-xl transition-all duration-300"
                    style={focusedField === 'password' ? { boxShadow: `0 0 0 2px rgba(6,182,212,0.30), 0 4px 6px rgba(6,182,212,0.05)` } : {}}
                  >
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Lock
                        className={`transition-colors duration-300 ${focusedField === 'password' ? t.iconFocus : t.iconDefault}`}
                        size={18}
                      />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="••••••••••••"
                      className={`block w-full pl-11 pr-12 py-3 text-sm rounded-xl focus:outline-none transition-all duration-300 ${t.inputText} ${t.inputPlaceholder}`}
                      style={{
                        background: focusedField === 'password' ? t.inputFocusBg : t.inputBg,
                        border: `1px solid ${focusedField === 'password' ? t.inputFocusBorder : t.inputBorder}`,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute inset-y-0 right-0 flex items-center pr-3.5 transition-colors duration-200 ${t.eyeBtn}`}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl animate-fadeIn ${t.errorText}`}
                    style={{ background: t.errorBg, border: `1px solid ${t.errorBorder}` }}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {/* Submit Button — unchanged */}
                <button type="submit" disabled={isLoading} className="relative w-full group mt-2">
                  <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
                  <div className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm transition-all duration-300 group-hover:shadow-lg group-hover:shadow-cyan-500/25 group-active:scale-[0.98]">
                    {isLoading ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                      </>
                    )}
                  </div>
                </button>
              </form>

              {/* ── Footer Info ── */}
              <div className="mt-8 pt-6 transition-colors duration-300" style={{ borderTop: `1px solid ${t.footerBorder}` }}>
                <div className={`flex items-center justify-center gap-6 text-[11px] transition-colors duration-300 ${t.footerText}`}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                    <span>System Online</span>
                  </div>
                  <span className={t.footerDot}>•</span>
                  <span>v2.0.0</span>
                  <span className={t.footerDot}>•</span>
                  <span>PMC Pune</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom text ── */}
          <p className={`mt-6 text-center text-[11px] transition-colors duration-300 ${t.bottomText}`}>
            Access restricted to authorized Admin & QC personnel.
            <br />
            Contact IT department for credentials.
          </p>
        </div>
      </div>
    </>
  );
}