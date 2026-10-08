// סרט המדידה של החייט: סימן המותג שמפריד בין חלקי הדף
export default function MeasuringTape({ className = "" }: { className?: string }) {
  const ticks = Array.from({ length: 241 }, (_, i) => i);
  return (
    <svg viewBox="0 0 2400 64" preserveAspectRatio="xMinYMid slice" aria-hidden className={className}>
      <rect width="2400" height="64" fill="#eed89b" />
      <rect width="2400" height="3" fill="#d9bf74" />
      <rect y="61" width="2400" height="3" fill="#d9bf74" />
      {ticks.map((i) => {
        const major = i % 10 === 0, mid = i % 5 === 0;
        return <rect key={i} x={i * 10} y={0} width={major ? 2 : 1} height={major ? 30 : mid ? 20 : 12} fill="#0a0908" />;
      })}
      {ticks.filter((i) => i % 10 === 0 && i > 0).map((i) => (
        <text key={i} x={i * 10 + 6} y={50} fontSize="17" fontWeight="600" fill="#0a0908" fontFamily="Ploni, sans-serif">{i / 10}</text>
      ))}
    </svg>
  );
}
