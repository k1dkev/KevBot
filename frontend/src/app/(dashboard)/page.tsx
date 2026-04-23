export default function HomePage() {
  return (
    <div className="kb-view">
      <div
        style={{
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "80px 24px",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--kb-text)" }}>Welcome!</h1>
        <p style={{ fontSize: 13, color: "var(--kb-text2)" }}>More to come soon…</p>
      </div>
    </div>
  );
}
