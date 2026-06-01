import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#fffbeb",
        width: 180,
        height: 180,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 40,
      }}
    >
      {/* Simplified printer icon in amber */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        {/* Top paper slot */}
        <div
          style={{
            width: 76,
            height: 26,
            background: "#d97706",
            borderRadius: "6px 6px 0 0",
          }}
        />
        {/* Printer body */}
        <div
          style={{
            width: 100,
            height: 38,
            background: "#d97706",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 14,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              background: "#fef3c7",
              borderRadius: "50%",
            }}
          />
        </div>
        {/* Output paper */}
        <div
          style={{
            width: 76,
            height: 26,
            background: "#92400e",
            borderRadius: "0 0 6px 6px",
          }}
        />
      </div>
    </div>,
    size,
  );
}
