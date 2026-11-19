import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import {
  identityLabel,
  shareAmount,
  shareEntryPrice,
  shareNumber,
  shareStateCopy,
  type ShareSnapshot,
} from "@collectible/domain";
import { publicAssetPath, shareImage } from "./share-image";
import { ellipsis, fitSize, textWidth, titleLines } from "./share-text";

const markPaths = [
  "M20 0H80Q86 0 90 4L96 10Q100 14 100 20V75Q100 84 92 80L8 35Q0 31 0 24V20Q0 14 4 10L10 4Q14 0 20 0Z",
  "M8 62L92 107Q100 111 100 118V120Q100 126 96 130L90 136Q86 140 80 140H20Q14 140 10 136L4 130Q0 126 0 120V67Q0 58 8 62Z",
];
const box = (
  x: number,
  y: number,
  width: number,
  style: CSSProperties = {},
): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width,
  display: "flex",
  ...style,
});
const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
function Line({
  children,
  x,
  y,
  width,
  size = 23,
  color = "#F3F6FA",
  style = {},
}: {
  children: ReactNode;
  x: number;
  y: number;
  width: number;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={box(x, y, width, {
        fontSize: size,
        color,
        lineHeight: 1.2,
        ...style,
      })}
    >
      {children}
    </div>
  );
}
export function ShareCard({
  snapshot: s,
  background,
}: {
  snapshot: ShareSnapshot;
  background: string;
}) {
  const copy = shareStateCopy[s.state],
    value = shareAmount(s),
    amount = shareNumber(value, 2);
  const accent =
    s.state === "won" ? "#58D6A7" : s.state === "lost" ? "#F0818B" : "#80C9FF";
  const factsX = s.slab ? 540 : 690,
    factsWidth = s.slab ? 280 : 440;
  const rows = [
    ["Position", s.market.side?.toUpperCase() ?? "—"],
    ["Cost", shareNumber(s.trade.cost, 2)],
    ["Avg. entry", shareEntryPrice(s.trade.averageEntryPrice)],
    ["Shares", shareNumber(s.trade.quantity)],
  ];
  const title = titleLines(s.market.title);
  const profitAmount =
    s.trade.profit === null
      ? ""
      : `${s.trade.profit.startsWith("-") ? "−" : "+"}$${shareNumber(s.trade.profit.replace("-", ""), 2)}`;
  const profitLine = `${copy.profit} ${profitAmount}`,
    splitProfit = textWidth(profitLine, 22) > 440;
  const returnLine =
    s.trade.roiPercent === null
      ? ""
      : `${shareNumber(s.trade.roiPercent, 1, 2)}% return`;
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        background: "#0B1118",
        color: "#F3F6FA",
        fontFamily: "Inter",
        position: "relative",
      }}
    >
      <img
        src={background}
        width={1200}
        height={630}
        style={box(0, 0, 1200, { height: 630 })}
      />
      <div
        style={box(48, 48, 64, {
          height: 64,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        {s.market.artwork.length ? (
          s.market.artwork
            .slice(0, 2)
            .map((a, i) => (
              <img
                key={i}
                src={a.src}
                width={s.market.artwork.length > 1 ? 32 : 64}
                height={64}
                style={{ objectFit: "contain" }}
              />
            ))
        ) : (
          <div style={{ fontSize: 14, color: "#8E9CAC" }}>
            Event image unavailable
          </div>
        )}
      </div>
      {title.lines.map((line, i) => (
        <Line
          key={i}
          x={132}
          y={44 + i * 48}
          width={800}
          size={title.size}
          style={{ whiteSpace: "nowrap", fontWeight: 600 }}
        >
          {line}
        </Line>
      ))}
      <Line
        x={970}
        y={48}
        width={182}
        size={22}
        color={accent}
        style={{
          border: `2px solid ${accent}`,
          borderRadius: 28,
          padding: "8px 14px",
          justifyContent: "center",
        }}
      >
        {copy.badge}
      </Line>
      <Line x={48} y={174} width={770}>
        {clip(identityLabel(s), 65)}
      </Line>
      <Line x={48} y={254} width={440} size={28}>
        {s.trade.payoutReceipt === "received" && s.state === "won"
          ? "Payout received"
          : copy.headline}
      </Line>
      <Line
        x={48}
        y={302}
        width={440}
        size={fitSize(`$${amount}`, 440, 80, 12, 650)}
        color={accent}
        style={{ whiteSpace: "nowrap", fontWeight: 600 }}
      >
        {value === null ? "—" : `$${amount}`}
      </Line>
      {s.trade.profit !== null && s.state !== "pending" && (
        <>
          <Line
            x={48}
            y={406}
            width={440}
            size={22}
            style={{ whiteSpace: "nowrap" }}
          >
            {splitProfit ? copy.profit : profitLine}
          </Line>
          {splitProfit && (
            <Line
              x={48}
              y={436}
              width={440}
              size={fitSize(profitAmount, 440, 23)}
              style={{ whiteSpace: "nowrap" }}
            >
              {profitAmount}
            </Line>
          )}
          {returnLine && (
            <Line
              x={48}
              y={splitProfit ? 472 : 442}
              width={440}
              size={fitSize(returnLine, 440, splitProfit ? 16 : 18)}
              color="#8E9CAC"
              style={{ whiteSpace: "nowrap" }}
            >
              {returnLine}
            </Line>
          )}
        </>
      )}
      <div
        style={box(factsX - 24, 250, 1, { height: 240, background: "#293541" })}
      />
      {rows.map(([label, v], i) => (
        <div
          key={label}
          style={box(factsX, 254 + i * 44, factsWidth, {
            justifyContent: "space-between",
            gap: 12,
            fontSize: fitSize(`${label}  ${v}`, factsWidth, 23, 12, 650),
            whiteSpace: "nowrap",
          })}
        >
          <span style={{ color: "#8E9CAC" }}>{label}</span>
          <span style={{ fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      <Line x={factsX} y={444} width={factsWidth} size={18} color="#8E9CAC">
        {clip(s.market.selectedOutcome, 48)}
      </Line>
      {s.slab && (
        <>
          <div
            style={box(860, 130, 292, {
              height: 390,
              background: "#151E28",
              borderRadius: 18,
            })}
          />
          <Line
            x={872}
            y={140}
            width={268}
            size={17}
            style={{ justifyContent: "center" }}
          >
            {s.slab.role === "collected"
              ? "COLLECTED"
              : s.state === "won"
                ? "SLAB WON"
                : "SLAB"}
          </Line>
          {s.slab.frontImage ? (
            <img
              src={s.slab.frontImage}
              width={176}
              height={292}
              style={box(918, 164, 176, { height: 292, objectFit: "contain" })}
            />
          ) : (
            <div
              style={box(890, 164, 232, {
                height: 292,
                alignItems: "center",
                justifyContent: "center",
                color: "#8E9CAC",
                fontSize: 20,
              })}
            >
              Image unavailable
            </div>
          )}
          <Line
            x={874}
            y={464}
            width={264}
            size={17}
            style={{ justifyContent: "center", whiteSpace: "nowrap" }}
          >
            {ellipsis(s.slab.player || s.slab.name, 264, 17)}
          </Line>
          <Line
            x={874}
            y={491}
            width={264}
            size={fitSize(
              [s.slab.year, s.slab.set, s.slab.grader, s.slab.grade]
                .filter(Boolean)
                .join(" · ") || s.slab.name,
              264,
              13,
              10,
            )}
            color="#C5CFDA"
            style={{ justifyContent: "center", whiteSpace: "nowrap" }}
          >
            {ellipsis(
              [s.slab.year, s.slab.set, s.slab.grader, s.slab.grade]
                .filter(Boolean)
                .join(" · ") || s.slab.name,
              264,
              10,
            )}
          </Line>
        </>
      )}
      <div style={box(48, 530, 1104, { height: 1, background: "#293541" })} />
      <svg
        width={23}
        height={32}
        viewBox="0 0 100 140"
        style={box(48, 558, 23)}
      >
        {markPaths.map((d) => (
          <path key={d} d={d} fill="#80C9FF" />
        ))}
      </svg>
      <Line x={88} y={558} width={220} size={28}>
        Slabline
      </Line>
    </div>
  );
}
export async function renderShare(snapshot: ShareSnapshot) {
  const [font, displayFont, background, artwork, slabImage] = await Promise.all(
    [
      readFile(publicAssetPath("fonts/Inter-Medium.ttf")),
      readFile(publicAssetPath("fonts/Inter-Semibold.ttf")),
      readFile(publicAssetPath("brand/share-background-landscape.png")),
      Promise.all(
        snapshot.market.artwork.map(async (a) => ({
          ...a,
          src: await shareImage(a.src),
        })),
      ),
      shareImage(snapshot.slab?.frontImage ?? null),
    ],
  );
  // Cache verified raster bytes in the snapshot; later catalog changes cannot alter it.
  const resolved: ShareSnapshot = {
    ...snapshot,
    market: {
      ...snapshot.market,
      artwork: artwork.filter(
        (a): a is { src: string; label: string } => !!a.src,
      ),
    },
    slab: snapshot.slab ? { ...snapshot.slab, frontImage: slabImage } : null,
  };
  // Satori registers 100-step weights; this second static font contains the approved
  // 650 outlines. Its advance metrics are measured from that same font file.
  const response = new ImageResponse(
    <ShareCard
      snapshot={resolved}
      background={`data:image/png;base64,${background.toString("base64")}`}
    />,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: font.buffer.slice(
            font.byteOffset,
            font.byteOffset + font.byteLength,
          ) as ArrayBuffer,
          weight: 500,
        },
        {
          name: "Inter",
          data: displayFont.buffer.slice(
            displayFont.byteOffset,
            displayFont.byteOffset + displayFont.byteLength,
          ) as ArrayBuffer,
          weight: 600,
        },
      ],
    },
  );
  return {
    snapshot: resolved,
    png: Buffer.from(await response.arrayBuffer()).toString("base64"),
  };
}
