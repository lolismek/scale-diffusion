"use client";
import React, { useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import {
  IconBrightnessDown,
  IconBrightnessUp,
  IconCaretRightFilled,
  IconCaretUpFilled,
  IconChevronUp,
  IconMicrophone,
  IconMoon,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconTable,
  IconVolume,
  IconVolume2,
  IconVolume3,
  IconSearch,
  IconWorld,
  IconCommand,
  IconCaretLeftFilled,
  IconCaretDownFilled,
} from "@tabler/icons-react";

export const MacbookHover = ({ src, showGradient, badge, onHoverChange }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleHover = (hovered) => {
    setIsHovered(hovered);
    onHoverChange?.(hovered);
  };

  const hoverProgress = useMotionValue(0);
  const springConfig = { stiffness: 100, damping: 20 };
  const smoothProgress = useSpring(hoverProgress, springConfig);

  React.useEffect(() => {
    hoverProgress.set(isHovered ? 1 : 0);
  }, [isHovered, hoverProgress]);

  const scaleX = useTransform(smoothProgress, [0, 1], [1.2, 1.3]);
  const scaleY = useTransform(smoothProgress, [0, 1], [0.6, 1.3]);
  const rotate = useTransform(smoothProgress, [0, 0.2, 1], [-28, -28, 0]);
  const translate = useTransform(smoothProgress, [0, 1], [0, -310]);
  const baseTranslate = useTransform(smoothProgress, [0, 1], [0, 0]);

  return (
    <div
      className="macbook-hover-container"
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
    >
      <div style={{
        display: "flex",
        flexShrink: 0,
        transform: "scale(0.9)",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        perspective: "800px"
      }}>
        <Lid
          src={src}
          scaleX={scaleX}
          scaleY={scaleY}
          rotate={rotate}
          translate={translate}
        />
        {/* Base area */}
        <motion.div style={{
          position: "relative",
          zIndex: -10,
          height: "22rem",
          width: "32rem",
          overflow: "hidden",
          borderRadius: "12px",
          background: "linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)) padding-box, linear-gradient(135deg, rgba(217, 119, 87, 0.3), rgba(244, 243, 238, 0.2), rgba(217, 119, 87, 0.3)) border-box",
          backdropFilter: "blur(16px) saturate(140%) brightness(1.05)",
          border: "1px solid transparent",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          translateY: baseTranslate
        }}>
          {/* Hinge bar */}
          <div style={{ position: "relative", height: "2.5rem", width: "100%" }}>
            <div style={{
              position: "absolute",
              left: 0,
              right: 0,
              marginLeft: "auto",
              marginRight: "auto",
              height: "1rem",
              width: "80%",
              backgroundColor: "rgba(5, 5, 5, 0.8)"
            }} />
          </div>
          <div style={{ position: "relative", display: "flex" }}>
            <div style={{ marginLeft: "auto", marginRight: "auto", height: "100%", width: "10%", overflow: "hidden" }}>
              <SpeakerGrid />
            </div>
            <div style={{ marginLeft: "auto", marginRight: "auto", height: "100%", width: "80%" }}>
              <Keypad />
            </div>
            <div style={{ marginLeft: "auto", marginRight: "auto", height: "100%", width: "10%", overflow: "hidden" }}>
              <SpeakerGrid />
            </div>
          </div>
          <Trackpad />
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            marginLeft: "auto",
            marginRight: "auto",
            height: "0.5rem",
            width: "5rem",
            borderTopLeftRadius: "1.5rem",
            borderTopRightRadius: "1.5rem",
            background: "linear-gradient(to top, rgba(32, 31, 30, 0.7), rgba(5, 5, 5, 0.8))"
          }} />
          {showGradient && (
            <div style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              height: "10rem",
              width: "100%",
              background: "linear-gradient(to top, black, black, transparent)"
            }} />
          )}
          {badge && <div style={{ position: "absolute", bottom: "1rem", left: "1rem" }}>{badge}</div>}
        </motion.div>
      </div>
    </div>
  );
};

export const Lid = ({ scaleX, scaleY, rotate, translate, src }) => {
  return (
    <div style={{ position: "relative", perspective: "800px" }}>
      <div style={{
        transform: "perspective(800px) rotateX(-25deg) translateZ(0px)",
        transformOrigin: "bottom",
        transformStyle: "preserve-3d",
        background: "linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)) padding-box, linear-gradient(135deg, rgba(217, 119, 87, 0.3), rgba(244, 243, 238, 0.2), rgba(217, 119, 87, 0.3)) border-box",
        backdropFilter: "blur(16px) saturate(140%) brightness(1.05)",
        border: "1px solid transparent",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        position: "relative",
        height: "12rem",
        width: "32rem",
        borderRadius: "12px",
        padding: "0.5rem"
      }}>
        <div style={{
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.25)",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "8px"
        }}>
          <span style={{ color: "#faf9f4" }}>
            <AceternityLogo />
          </span>
        </div>
      </div>
      <motion.div
        style={{
          scaleX: scaleX,
          scaleY: scaleY,
          rotateX: rotate,
          translateY: translate,
          transformStyle: "preserve-3d",
          transformOrigin: "top",
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(16px) saturate(140%) brightness(1.05)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.7), 0 0 40px rgba(255, 255, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          height: "24rem",
          width: "32rem",
          borderRadius: "12px",
          padding: "0.5rem"
        }}
      >
        <div style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: "8px",
          backgroundColor: "rgba(0, 0, 0, 0.7)"
        }} />
        {src && (
          src.endsWith('.mp4') || src.endsWith('.webm') ? (
            <video
              src={src}
              autoPlay
              loop
              muted
              playsInline
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                height: "100%",
                width: "100%",
                borderRadius: "0.5rem",
                objectFit: "cover",
                objectPosition: "center",
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                boxShadow: "0 0 40px rgba(220, 200, 240, 0.15), 0 0 80px rgba(255, 240, 255, 0.08)"
              }}
            />
          ) : (
            <img
              src={src}
              alt="macbook screen"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                height: "100%",
                width: "100%",
                borderRadius: "0.5rem",
                objectFit: "cover",
                objectPosition: "center",
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                boxShadow: "0 0 40px rgba(220, 200, 240, 0.15), 0 0 80px rgba(255, 240, 255, 0.08)"
              }}
            />
          )
        )}
      </motion.div>
    </div>
  );
};

export const Trackpad = () => {
  return (
    <div style={{
      marginLeft: "auto",
      marginRight: "auto",
      marginTop: "0.25rem",
      marginBottom: "0.25rem",
      height: "8rem",
      width: "40%",
      borderRadius: "8px",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(10px)"
    }} />
  );
};

export const Keypad = () => {
  return (
    <div style={{
      marginLeft: "0.25rem",
      marginRight: "0.25rem",
      height: "100%",
      borderRadius: "8px",
      padding: "0.25rem",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      boxShadow: "0 0 20px rgba(255, 255, 255, 0.12), inset 0 0 15px rgba(255, 255, 255, 0.05)"
    }}>
      {/* First Row */}
      <Row>
        <KBtn width="2.5rem" alignItems="flex-end" justifyContent="flex-start" pb="2px" pl="4px" childAlign="flex-start">
          esc
        </KBtn>
        <KBtn>
          <IconBrightnessDown style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F1</span>
        </KBtn>
        <KBtn>
          <IconBrightnessUp style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F2</span>
        </KBtn>
        <KBtn>
          <IconTable style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F3</span>
        </KBtn>
        <KBtn>
          <IconSearch style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F4</span>
        </KBtn>
        <KBtn>
          <IconMicrophone style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F5</span>
        </KBtn>
        <KBtn>
          <IconMoon style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F6</span>
        </KBtn>
        <KBtn>
          <IconPlayerTrackPrev style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F7</span>
        </KBtn>
        <KBtn>
          <IconPlayerSkipForward style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F8</span>
        </KBtn>
        <KBtn>
          <IconPlayerTrackNext style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F9</span>
        </KBtn>
        <KBtn>
          <IconVolume3 style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F10</span>
        </KBtn>
        <KBtn>
          <IconVolume2 style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F11</span>
        </KBtn>
        <KBtn>
          <IconVolume style={{ height: "6px", width: "6px" }} />
          <span style={{ marginTop: "0.25rem", display: "inline-block" }}>F12</span>
        </KBtn>
        <KBtn>
          <div style={{
            height: "1rem",
            width: "1rem",
            borderRadius: "9999px",
            padding: "1px",
            background: "linear-gradient(to bottom, #171717 20%, black 50%, #171717 95%)"
          }}>
            <div style={{ height: "100%", width: "100%", borderRadius: "9999px", backgroundColor: "black" }} />
          </div>
        </KBtn>
      </Row>

      {/* Second row */}
      <Row>
        <KBtn><span style={{ display: "block" }}>~</span><span style={{ display: "block" }}>`</span></KBtn>
        <KBtn><span style={{ display: "block" }}>!</span><span style={{ display: "block" }}>1</span></KBtn>
        <KBtn><span style={{ display: "block" }}>@</span><span style={{ display: "block" }}>2</span></KBtn>
        <KBtn><span style={{ display: "block" }}>#</span><span style={{ display: "block" }}>3</span></KBtn>
        <KBtn><span style={{ display: "block" }}>$</span><span style={{ display: "block" }}>4</span></KBtn>
        <KBtn><span style={{ display: "block" }}>%</span><span style={{ display: "block" }}>5</span></KBtn>
        <KBtn><span style={{ display: "block" }}>^</span><span style={{ display: "block" }}>6</span></KBtn>
        <KBtn><span style={{ display: "block" }}>&</span><span style={{ display: "block" }}>7</span></KBtn>
        <KBtn><span style={{ display: "block" }}>*</span><span style={{ display: "block" }}>8</span></KBtn>
        <KBtn><span style={{ display: "block" }}>(</span><span style={{ display: "block" }}>9</span></KBtn>
        <KBtn><span style={{ display: "block" }}>)</span><span style={{ display: "block" }}>0</span></KBtn>
        <KBtn><span style={{ display: "block" }}>—</span><span style={{ display: "block" }}>_</span></KBtn>
        <KBtn><span style={{ display: "block" }}>+</span><span style={{ display: "block" }}>=</span></KBtn>
        <KBtn width="2.5rem" alignItems="flex-end" justifyContent="flex-end" pr="4px" pb="2px" childAlign="flex-end">
          delete
        </KBtn>
      </Row>

      {/* Third row */}
      <Row>
        <KBtn width="2.5rem" alignItems="flex-end" justifyContent="flex-start" pb="2px" pl="4px" childAlign="flex-start">
          tab
        </KBtn>
        <KBtn><span style={{ display: "block" }}>Q</span></KBtn>
        <KBtn><span style={{ display: "block" }}>W</span></KBtn>
        <KBtn><span style={{ display: "block" }}>E</span></KBtn>
        <KBtn><span style={{ display: "block" }}>R</span></KBtn>
        <KBtn><span style={{ display: "block" }}>T</span></KBtn>
        <KBtn><span style={{ display: "block" }}>Y</span></KBtn>
        <KBtn><span style={{ display: "block" }}>U</span></KBtn>
        <KBtn><span style={{ display: "block" }}>I</span></KBtn>
        <KBtn><span style={{ display: "block" }}>O</span></KBtn>
        <KBtn><span style={{ display: "block" }}>P</span></KBtn>
        <KBtn><span style={{ display: "block" }}>{"{"}</span><span style={{ display: "block" }}>{"["}</span></KBtn>
        <KBtn><span style={{ display: "block" }}>{"}"}</span><span style={{ display: "block" }}>{"]"}</span></KBtn>
        <KBtn><span style={{ display: "block" }}>{"|"}</span><span style={{ display: "block" }}>{"\\"}</span></KBtn>
      </Row>

      {/* Fourth Row */}
      <Row>
        <KBtn width="2.8rem" alignItems="flex-end" justifyContent="flex-start" pb="2px" pl="4px" childAlign="flex-start">
          caps lock
        </KBtn>
        <KBtn><span style={{ display: "block" }}>A</span></KBtn>
        <KBtn><span style={{ display: "block" }}>S</span></KBtn>
        <KBtn><span style={{ display: "block" }}>D</span></KBtn>
        <KBtn><span style={{ display: "block" }}>F</span></KBtn>
        <KBtn><span style={{ display: "block" }}>G</span></KBtn>
        <KBtn><span style={{ display: "block" }}>H</span></KBtn>
        <KBtn><span style={{ display: "block" }}>J</span></KBtn>
        <KBtn><span style={{ display: "block" }}>K</span></KBtn>
        <KBtn><span style={{ display: "block" }}>L</span></KBtn>
        <KBtn><span style={{ display: "block" }}>:</span><span style={{ display: "block" }}>;</span></KBtn>
        <KBtn><span style={{ display: "block" }}>"</span><span style={{ display: "block" }}>'</span></KBtn>
        <KBtn width="2.85rem" alignItems="flex-end" justifyContent="flex-end" pr="4px" pb="2px" childAlign="flex-end">
          return
        </KBtn>
      </Row>

      {/* Fifth Row */}
      <Row>
        <KBtn width="3.65rem" alignItems="flex-end" justifyContent="flex-start" pb="2px" pl="4px" childAlign="flex-start">
          shift
        </KBtn>
        <KBtn><span style={{ display: "block" }}>Z</span></KBtn>
        <KBtn><span style={{ display: "block" }}>X</span></KBtn>
        <KBtn><span style={{ display: "block" }}>C</span></KBtn>
        <KBtn><span style={{ display: "block" }}>V</span></KBtn>
        <KBtn><span style={{ display: "block" }}>B</span></KBtn>
        <KBtn><span style={{ display: "block" }}>N</span></KBtn>
        <KBtn><span style={{ display: "block" }}>M</span></KBtn>
        <KBtn><span style={{ display: "block" }}>{"<"}</span><span style={{ display: "block" }}>,</span></KBtn>
        <KBtn><span style={{ display: "block" }}>{">"}</span><span style={{ display: "block" }}>.</span></KBtn>
        <KBtn><span style={{ display: "block" }}>?</span><span style={{ display: "block" }}>/</span></KBtn>
        <KBtn width="3.65rem" alignItems="flex-end" justifyContent="flex-end" pr="4px" pb="2px" childAlign="flex-end">
          shift
        </KBtn>
      </Row>

      {/* Sixth Row */}
      <Row>
        <KBtn childFlex>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", paddingRight: "0.25rem" }}>
            <span style={{ display: "block" }}>fn</span>
          </div>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <IconWorld style={{ height: "6px", width: "6px" }} />
          </div>
        </KBtn>
        <KBtn childFlex>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", paddingRight: "0.25rem" }}>
            <IconChevronUp style={{ height: "6px", width: "6px" }} />
          </div>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <span style={{ display: "block" }}>control</span>
          </div>
        </KBtn>
        <KBtn childFlex>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", paddingRight: "0.25rem" }}>
            <OptionKey style={{ height: "6px", width: "6px" }} />
          </div>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <span style={{ display: "block" }}>option</span>
          </div>
        </KBtn>
        <KBtn width="2rem" childFlex>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", paddingRight: "0.25rem" }}>
            <IconCommand style={{ height: "6px", width: "6px" }} />
          </div>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <span style={{ display: "block" }}>command</span>
          </div>
        </KBtn>
        <KBtn width="8.2rem" />
        <KBtn width="2rem" childFlex>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <IconCommand style={{ height: "6px", width: "6px" }} />
          </div>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <span style={{ display: "block" }}>command</span>
          </div>
        </KBtn>
        <KBtn childFlex>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <OptionKey style={{ height: "6px", width: "6px" }} />
          </div>
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-start", paddingLeft: "0.25rem" }}>
            <span style={{ display: "block" }}>option</span>
          </div>
        </KBtn>
        {/* Arrow keys */}
        <div style={{
          marginTop: "2px",
          display: "flex",
          height: "1.5rem",
          width: "4.9rem",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          borderRadius: "4px",
          padding: "0.5px"
        }}>
          <KBtn height="0.75rem">
            <IconCaretUpFilled style={{ height: "6px", width: "6px" }} />
          </KBtn>
          <div style={{ display: "flex" }}>
            <KBtn height="0.75rem">
              <IconCaretLeftFilled style={{ height: "6px", width: "6px" }} />
            </KBtn>
            <KBtn height="0.75rem">
              <IconCaretDownFilled style={{ height: "6px", width: "6px" }} />
            </KBtn>
            <KBtn height="0.75rem">
              <IconCaretRightFilled style={{ height: "6px", width: "6px" }} />
            </KBtn>
          </div>
        </div>
      </Row>
    </div>
  );
};

const Row = ({ children }) => (
  <div style={{
    display: "flex",
    width: "100%",
    flexShrink: 0,
    gap: "2px",
    marginBottom: "2px"
  }}>
    {children}
  </div>
);

export const KBtn = ({
  children,
  width = "1.5rem",
  height = "1.5rem",
  alignItems,
  justifyContent,
  pb,
  pl,
  pr,
  childAlign,
  childFlex,
  backlit = true,
}) => {
  return (
    <div style={{
      flexShrink: 0,
      borderRadius: "4px",
      padding: "0.5px",
      backgroundColor: backlit ? "rgba(255, 255, 255, 0.08)" : undefined,
      boxShadow: backlit ? "0 0 6px rgba(255, 255, 255, 0.15)" : undefined
    }}>
      <div style={{
        display: "flex",
        width: width,
        height: height,
        alignItems: alignItems || "center",
        justifyContent: justifyContent || "center",
        borderRadius: "3.5px",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        paddingBottom: pb,
        paddingLeft: pl,
        paddingRight: pr
      }}>
        <div style={{
          display: "flex",
          width: "100%",
          height: childFlex ? "100%" : undefined,
          flexDirection: "column",
          alignItems: childAlign || "center",
          justifyContent: childFlex ? "space-between" : "center",
          padding: childFlex ? "4px 0" : undefined,
          fontSize: "5px",
          color: backlit ? "#ffffff" : "#e5e5e5"
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export const SpeakerGrid = () => {
  return (
    <div style={{
      marginTop: "0.5rem",
      display: "flex",
      height: "10rem",
      gap: "2px",
      paddingLeft: "0.5px",
      paddingRight: "0.5px",
      backgroundImage: "radial-gradient(circle, #08080A 0.5px, transparent 0.5px)",
      backgroundSize: "3px 3px"
    }} />
  );
};

export const OptionKey = ({ style }) => {
  return (
    <svg
      fill="none"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      style={style}
    >
      <rect stroke="currentColor" strokeWidth={2} x="18" y="5" width="10" height="2" />
      <polygon stroke="currentColor" strokeWidth={2} points="10.6,5 4,5 4,7 9.4,7 18.4,27 28,27 28,25 19.6,25" />
      <rect width="32" height="32" stroke="none" />
    </svg>
  );
};

const AceternityLogo = () => {
  return (
    <svg
      width="66"
      height="65"
      viewBox="0 0 66 65"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ height: "0.75rem", width: "0.75rem", color: "#faf9f4" }}
    >
      <path
        d="M8 8.05571C8 8.05571 54.9009 18.1782 57.8687 30.062C60.8365 41.9458 9.05432 57.4696 9.05432 57.4696"
        stroke="currentColor"
        strokeWidth="15"
        strokeMiterlimit="3.86874"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default MacbookHover;
