import { getTokens } from '@/lib/dashboardTheme'

export function DashboardSkeleton({ dark }: { dark: boolean }) {
  const T = getTokens(dark)

  const bg = dark
    ? `linear-gradient(90deg, ${T.card} 25%, ${T.surface} 50%, ${T.card} 75%)`
    : `linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)`

  const Block = ({ w, h, r = 6, mb = 0, delay = 0 }: {
    w: string | number; h: number; r?: number; mb?: number; delay?: number
  }) => (
    <div style={{
      width: w, height: h, borderRadius: r, marginBottom: mb, flexShrink: 0,
      background: bg, backgroundSize: '800px 100%',
      animation: `shimmer 1.6s ease-in-out ${delay}ms infinite`,
    }} />
  )

  const Card = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
    <div style={{
      background: T.card, border: `1px solid ${T.cardBorder}`,
      borderRadius: 12, padding: 18,
      animation: `fadeIn 0.4s ease ${delay}ms both`,
    }}>
      {children}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position:  400px 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* Meta bar */}
      <div className="flex items-center justify-between mb-5 rounded-xl px-4 py-3"
        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
        <Block w={220} h={10} delay={0} />
        <div className="flex gap-2">
          <Block w={64} h={28} r={7} delay={50} />
          <Block w={64} h={28} r={7} delay={100} />
          <Block w={80} h={28} r={7} delay={150} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap mb-5 rounded-xl px-4 py-3"
        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
        {[80, 100, 100, 90, 90, 100, 60].map((w, i) => (
          <Block key={i} w={w} h={30} r={7} delay={i * 30} />
        ))}
      </div>

      {/* KPI grid — 2 rows of 5 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} delay={i * 40}>
            <Block w="45%" h={10} mb={10} delay={i * 40} />
            <Block w="65%" h={26} mb={8} delay={i * 40 + 20} />
            <Block w="35%" h={9}  delay={i * 40 + 40} />
          </Card>
        ))}
      </div>

      {/* Trend chart + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 mb-5">
        <Card delay={100}>
          <Block w="30%" h={11} mb={14} />
          <Block w="100%" h={190} r={8} />
          <div className="flex gap-4 mt-2">
            {[60, 70, 55].map((w, i) => <Block key={i} w={w} h={9} delay={i * 20} />)}
          </div>
        </Card>
        <Card delay={150}>
          <Block w="40%" h={11} mb={14} />
          <div className="flex justify-center mb-3">
            <Block w={140} h={140} r={70} />
          </div>
          {[70, 85, 60, 75].map((w, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Block w={8} h={8} r={4} />
              <Block w={`${w}%`} h={9} />
              <Block w={28} h={9} />
            </div>
          ))}
        </Card>
      </div>

      {/* Heatmap */}
      <Card delay={200}>
        <div className="flex items-center justify-between mb-4">
          <Block w="25%" h={11} />
          <div className="flex gap-1">
            {[40, 40, 40, 44, 40].map((w, i) => <Block key={i} w={w} h={24} r={5} delay={i * 20} />)}
          </div>
        </div>
        <div className="flex gap-4 mb-4">
          {[3].map(i => (
            <Block key={i} w={120} h={80} r={10} />
          ))}
          <Block w="100%" h={120} r={8} />
        </div>
      </Card>

      {/* Checklist + Shift punctuality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 my-5">
        <Card delay={250}>
          <Block w="40%" h={11} mb={14} />
          {[80, 65, 90, 55, 70, 60].map((w, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between mb-1">
                <Block w={`${w * 0.6}%`} h={9} />
                <Block w={60} h={9} />
              </div>
              <Block w="100%" h={6} r={4} />
            </div>
          ))}
        </Card>
        <Card delay={300}>
          <Block w="35%" h={11} mb={14} />
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl p-3" style={{ background: T.surface }}>
                <Block w="50%" h={9} mb={6} />
                <Block w="60%" h={22} />
              </div>
            ))}
          </div>
          <Block w="100%" h={12} r={6} />
        </Card>
      </div>

      {/* Team leaderboard + Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <Card delay={350}>
          <Block w="35%" h={11} mb={14} />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 mb-3 items-center">
              <Block w={24} h={14} />
              <Block w="30%" h={14} />
              <Block w="12%" h={14} />
              <Block w="12%" h={14} />
              <Block w="12%" h={14} />
              <Block w="20%" h={14} r={4} />
            </div>
          ))}
        </Card>
        <Card delay={400}>
          <Block w="30%" h={11} mb={14} />
          <Block w="100%" h={200} r={8} />
        </Card>
      </div>

      {/* Response time + Overdue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <Card delay={450}>
          <Block w="40%" h={11} mb={14} />
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl p-3" style={{ background: T.surface }}>
                <Block w="50%" h={9} mb={6} />
                <Block w="65%" h={20} />
              </div>
            ))}
          </div>
          <Block w="100%" h={160} r={8} />
        </Card>
        <Card delay={500}>
          <Block w="40%" h={11} mb={14} />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[0, 1, 2, 3].map(i => <Block key={i} w="100%" h={52} r={10} />)}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 mb-2 items-center rounded-lg p-2"
              style={{ background: T.surface }}>
              <Block w={52} h={36} r={8} />
              <div className="flex-1">
                <Block w="70%" h={11} mb={4} />
                <Block w="50%" h={9} />
              </div>
              <Block w={70} h={9} />
            </div>
          ))}
        </Card>
      </div>

      {/* Points overview */}
      <Card delay={550}>
        <Block w="25%" h={11} mb={14} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl p-3 flex items-center gap-2" style={{ background: T.surface }}>
              <Block w={4} h={36} r={2} />
              <div>
                <Block w={50} h={9} mb={4} />
                <Block w={36} h={20} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1].map(i => (
            <div key={i} className="rounded-xl p-3" style={{ background: T.surface }}>
              <Block w="40%" h={10} mb={10} />
              <Block w="100%" h={160} r={8} mb={10} />
              <div className="flex gap-1.5 flex-wrap">
                {[60, 70, 55, 65, 50].map((w, j) => <Block key={j} w={w} h={22} r={20} />)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}