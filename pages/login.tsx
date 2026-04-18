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
} from 'lucide-react';

// ─── Particle Background Canvas ───────────────────────────────────
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      pulse: number;
    }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
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
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += 0.02;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const currentOpacity = p.opacity * (0.5 + 0.5 * Math.sin(p.pulse));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6, 182, 212, ${currentOpacity})`;
        ctx.fill();

        // Connect nearby particles
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(6, 182, 212, ${0.08 * (1 - dist / 150)})`;
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}

// ─── Floating Icon Component ──────────────────────────────────────
function FloatingIcon({
  icon: Icon,
  className,
  delay,
}: {
  icon: any;
  className: string;
  delay: string;
}) {
  return (
    <div
      className={`absolute opacity-10 text-cyan-400 animate-float ${className}`}
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
  const { loginWithEmail } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await loginWithEmail(email, password);
      router.push('/');
    } catch (err) {
      setError('Invalid credentials. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* ── Global Styles (animations) ── */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(5deg);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes glow {
          0%,
          100% {
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.1);
          }
          50% {
            box-shadow: 0 0 40px rgba(6, 182, 212, 0.2);
          }
        }
        @keyframes shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }
        @keyframes pulse-ring {
          0% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          50% {
            transform: scale(1);
            opacity: 0.2;
          }
          100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
        }
        @keyframes grid-scroll {
          0% {
            transform: perspective(500px) rotateX(60deg) translateY(0);
          }
          100% {
            transform: perspective(500px) rotateX(60deg) translateY(40px);
          }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-slideUp {
          animation: slideUp 0.8s ease-out forwards;
        }
        .animate-fadeIn {
          animation: fadeIn 1s ease-out forwards;
        }
        .animate-glow {
          animation: glow 3s ease-in-out infinite;
        }
        .animate-shimmer {
          background-size: 200% auto;
          animation: shimmer 3s linear infinite;
        }
      `}</style>

      <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-[#0a0f1e]">
        {/* ── Background Layers ── */}

        {/* Gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1e] via-[#0d1526] to-[#0f1a30]" />

        {/* Animated grid */}
        <div className="absolute inset-0 overflow-hidden opacity-[0.04]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              animation: 'grid-scroll 8s linear infinite',
            }}
          />
        </div>

        {/* Radial glow spots */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/[0.02] rounded-full blur-3xl" />

        {/* Particles */}
        <ParticleBackground />

        {/* Floating icons */}
        <FloatingIcon icon={MapPin} className="top-[15%] left-[10%]" delay="0s" />
        <FloatingIcon icon={ClipboardCheck} className="top-[20%] right-[15%]" delay="2s" />
        <FloatingIcon icon={Shield} className="bottom-[25%] left-[8%]" delay="4s" />
        <FloatingIcon icon={MapPin} className="bottom-[15%] right-[10%]" delay="1s" />
        <FloatingIcon icon={ClipboardCheck} className="top-[60%] left-[20%]" delay="3s" />

        {/* ── Login Card ── */}
        <div
          className={`relative z-10 w-full max-w-[440px] mx-4 transition-all duration-1000 ${
            mounted ? 'animate-slideUp' : 'opacity-0'
          }`}
        >
          {/* Card glow border */}
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-cyan-500/20 via-cyan-500/5 to-transparent" />

          <div className="relative rounded-2xl bg-[#111827]/80 backdrop-blur-xl border border-white/[0.06] shadow-2xl shadow-black/40 animate-glow overflow-hidden">
            {/* Top accent line */}
            <div className="h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            <div className="px-8 pt-10 pb-8">
              {/* ── Logo & Title Section ── */}
              <div className="text-center mb-8">
                {/* Shield logo */}
                <div className="relative inline-flex items-center justify-center mb-5">
                  <div
                    className="absolute w-20 h-20 rounded-full bg-cyan-500/10"
                    style={{ animation: 'pulse-ring 3s ease-in-out infinite' }}
                  />
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center backdrop-blur-sm">
                    <Shield className="w-8 h-8 text-cyan-400" strokeWidth={1.5} />
                  </div>
                </div>

                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Taskforce
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Municipal Inspection System — Pune
                </p>
              </div>

              {/* ── Role Badge ── */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-medium text-cyan-300 tracking-wide uppercase">
                    Authorized Personnel Only
                  </span>
                </div>
              </div>

              {/* ── Login Form ── */}
              <form className="space-y-5" onSubmit={handleLogin}>
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="block text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    Email Address
                  </label>
                  <div
                    className={`relative rounded-xl transition-all duration-300 ${
                      focusedField === 'email'
                        ? 'ring-2 ring-cyan-500/30 shadow-lg shadow-cyan-500/5'
                        : ''
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Mail
                        className={`w-4.5 h-4.5 transition-colors duration-300 ${
                          focusedField === 'email'
                            ? 'text-cyan-400'
                            : 'text-gray-500'
                        }`}
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
                      placeholder="admin@taskforce.pune.gov.in"
                      className="block w-full pl-11 pr-4 py-3 text-sm text-white placeholder-gray-600 bg-white/[0.03] border border-white/[0.06] rounded-xl focus:outline-none transition-all duration-300 focus:bg-white/[0.05] focus:border-cyan-500/30"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <div
                    className={`relative rounded-xl transition-all duration-300 ${
                      focusedField === 'password'
                        ? 'ring-2 ring-cyan-500/30 shadow-lg shadow-cyan-500/5'
                        : ''
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Lock
                        className={`w-4.5 h-4.5 transition-colors duration-300 ${
                          focusedField === 'password'
                            ? 'text-cyan-400'
                            : 'text-gray-500'
                        }`}
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
                      className="block w-full pl-11 pr-12 py-3 text-sm text-white placeholder-gray-600 bg-white/[0.03] border border-white/[0.06] rounded-xl focus:outline-none transition-all duration-300 focus:bg-white/[0.05] focus:border-cyan-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-500 hover:text-cyan-400 transition-colors duration-200"
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/20 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="relative w-full group mt-2"
                >
                  {/* Button glow */}
                  <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />

                  <div className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm transition-all duration-300 group-hover:shadow-lg group-hover:shadow-cyan-500/25 group-active:scale-[0.98]">
                    {isLoading ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
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
              <div className="mt-8 pt-6 border-t border-white/[0.04]">
                <div className="flex items-center justify-center gap-6 text-[11px] text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                    <span>System Online</span>
                  </div>
                  <span className="text-gray-700">•</span>
                  <span>v2.0.0</span>
                  <span className="text-gray-700">•</span>
                  <span>PMC Pune</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom text ── */}
          <p className="mt-6 text-center text-[11px] text-gray-600">
            Access restricted to authorized Admin & QC personnel.
            <br />
            Contact IT department for credentials.
          </p>
        </div>
      </div>
    </>
  );
}


//========================================= old login ====================================================

// import { useState } from 'react';
// import { useAuth } from '@/contexts/AuthContext';
// import { useRouter } from 'next/router';
// import { Eye, EyeOff } from 'lucide-react';

// export default function LoginPage() {
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [showPassword, setShowPassword] = useState(false);
//   const [error, setError] = useState('');
//   const { loginWithEmail } = useAuth();
//   const router = useRouter();

//   const handleLogin = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setError('');
//     try {
//       await loginWithEmail(email, password);
//       router.push('/');
//     } catch (err) {
//       setError('Failed to login. Please check your credentials.');
//     }
//   };

//   return (
//     <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
//       <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 bg-opacity-50 rounded-lg shadow-lg backdrop-blur-md">
//         <h1 className="text-3xl font-bold text-center text-white">Super Admin Login</h1>
//         <form className="space-y-6" onSubmit={handleLogin}>
//           <div>
//             <label htmlFor="email" className="text-sm font-medium text-gray-300">Email address</label>
//             <input
//               id="email"
//               name="email"
//               type="email"
//               autoComplete="email"
//               required
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               className="block w-full px-3 py-2 mt-1 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
//             />
//           </div>
//           <div className="relative">
//             <label htmlFor="password" className="text-sm font-medium text-gray-300">Password</label>
//             <input
//               id="password"
//               name="password"
//               type={showPassword ? 'text' : 'password'}
//               autoComplete="current-password"
//               required
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               className="block w-full px-3 py-2 mt-1 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
//             />
//             <div className="absolute inset-y-0 right-0 flex items-center pr-3 pt-6">
//               {showPassword ? (
//                 <EyeOff
//                   className="w-5 h-5 text-gray-400 cursor-pointer"
//                   onClick={() => setShowPassword(false)}
//                 />
//               ) : (
//                 <Eye
//                   className="w-5 h-5 text-gray-400 cursor-pointer"
//                   onClick={() => setShowPassword(true)}
//                 />
//               )}
//             </div>
//           </div>
//           {error && <p className="text-sm text-red-500">{error}</p>}
//           <div>
//             <button
//               type="submit"
//               className="flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-300 ease-in-out transform hover:scale-105"
//             >
//               Sign in
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }