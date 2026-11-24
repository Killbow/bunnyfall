// Artwork from https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU/blob/495dd7e8c9dda7a2bb554306435654637cfa5b2a/src/mod/page/dfo_services.js
const BANK_LIGHT_WARM_MIX = 0.85;
function computeBankFlameFlicker(tSec = 0, phase = 0) {
    const t = Number.isFinite(tSec) ? tSec : 0;
    return {
      alphaJitter: Math.sin(t * 7.4 + phase) * 0.038 + Math.cos(t * 12.1 + phase * 1.3) * 0.026,
      radiusPulse: Math.sin(t * 5.2 + phase) * 1.4 + Math.cos(t * 9.8 + phase) * 0.7,
      sway: Math.sin(t * 9.5 + phase) * 0.52,
      stretch: Math.cos(t * 13.1 + phase) * 0.58,
    };
  }

function drawBankStandardLightGlow(
    ctx,
    coreX,
    coreY,
    spreadX,
    spreadY,
    radius,
    tSec = 0,
    intensity = BANK_LIGHT_WARM_MIX,
    phase = 0,
  ) {
    if (intensity <= 0.02) return;
    const fl = computeBankFlameFlicker(tSec, phase);
    const peakAlpha = Math.max(0.05, (0.28 + fl.alphaJitter) * intensity);
    const effR = Math.max(8, radius + fl.radiusPulse);
    const minX = Math.floor(Math.min(coreX, spreadX) - effR - 2);
    const minY = Math.floor(Math.min(coreY, spreadY) - effR - 2);
    const maxX = Math.ceil(Math.max(coreX, spreadX) + effR + 2);
    const maxY = Math.ceil(Math.max(coreY, spreadY) + effR + 2);
    const grad = ctx.createRadialGradient(coreX, coreY, 2, spreadX, spreadY, effR);
    grad.addColorStop(0, `rgba(255, 204, 102, ${peakAlpha})`);
    grad.addColorStop(0.42, `rgba(217, 119, 6, ${peakAlpha * 0.44})`);
    grad.addColorStop(0.76, `rgba(180, 83, 9, ${peakAlpha * 0.14})`);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }

function drawBankStandardFlameHalo(
    ctx,
    x,
    y,
    radius,
    tSec = 0,
    intensity = BANK_LIGHT_WARM_MIX,
    phase = 0,
  ) {
    if (intensity <= 0.02) return;
    const fl = computeBankFlameFlicker(tSec, phase);
    const haloAlpha = Math.max(0.12, (0.40 + fl.alphaJitter * 1.6) * intensity);
    const effR = Math.max(2, radius + fl.radiusPulse * 0.35);
    const haloGrad = ctx.createRadialGradient(x, y, 0.5, x, y, effR);
    haloGrad.addColorStop(0, `rgba(255, 224, 130, ${haloAlpha})`);
    haloGrad.addColorStop(0.48, `rgba(255, 165, 35, ${haloAlpha * 0.52})`);
    haloGrad.addColorStop(1, "rgba(255, 140, 0, 0)");
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(x, y, effR, 0, Math.PI * 2);
    ctx.fill();
  }

function computeBankSparklePulses(tSec = 0) {
    const t = Number.isFinite(tSec) ? tSec : 0;
    return {
      p1: Math.max(0, Math.sin(t * 2.2) - 0.58) / 0.42,
      p2: Math.max(0, Math.sin(t * 1.7 + 2.1) - 0.60) / 0.40,
    };
  }

function drawBankSparkle(ctx, cx, cy, size = 2, alpha = 1) {
    if (alpha <= 0.04) return;
    ctx.save();
    ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
    ctx.fillRect(Math.round(cx - size), Math.round(cy), size * 2 + 1, 1);
    ctx.fillRect(Math.round(cx), Math.round(cy - size), 1, size * 2 + 1);
    ctx.restore();
  }

function drawSafeHangingLantern(ctx, x, y, warmMix = BANK_LIGHT_WARM_MIX, tSec = 0) {
    ctx.save();
    ctx.translate(x, y);

    const fl = computeBankFlameFlicker(tSec, 1.4);

    // 1. Standardized warm lantern radial glow aura around lantern core (y=+29)
    drawBankStandardLightGlow(ctx, 0, 29, 14, 35, 70, tSec, warmMix, 1.4);

    // 2. Wrought-iron top-left stone wall mounting plate, ceiling lug & diagonal bracket arm
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-26, 8.8, 2.8, 8.6);
    ctx.fillStyle = "#d97706";
    ctx.fillRect(-25.2, 10.2, 1.1, 1.1);
    ctx.fillRect(-25.2, 14.8, 1.1, 1.1);

    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-25.2, 13);
    ctx.lineTo(0, 4.5);
    ctx.stroke();

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-25.2, 13);
    ctx.lineTo(0, 4.5);
    ctx.stroke();

    // Decorative S-scroll brace & wall plate rivet
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(-18, 10.5);
    ctx.quadraticCurveTo(-13, 2.5, -5, 6.2);
    ctx.stroke();
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-2.5, 0, 5, 4.5);
    ctx.fillStyle = "#d97706";
    ctx.fillRect(-20, 10.5, 1.8, 1.8);

    // 3 Forged iron chain links & bail suspension ring (y = 4..15)
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.1;
    for (let cy = 5.5; cy <= 11.5; cy += 3.0) {
      ctx.beginPath();
      if (typeof ctx.ellipse === "function") {
        ctx.ellipse(0, cy, 1.35, 1.8, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(0, cy, 1.4, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 14.5, 2.0, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Stepped ventilated iron cupola hood & brass crown finial (y = 16..22)
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(0, 16.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    const hoodG = ctx.createLinearGradient(-7, 17, 7, 22);
    hoodG.addColorStop(0, "#475569");
    hoodG.addColorStop(0.55, "#1e293b");
    hoodG.addColorStop(1, "#090d14");
    ctx.fillStyle = hoodG;
    ctx.beginPath();
    ctx.moveTo(-2.5, 16.5);
    ctx.lineTo(2.5, 16.5);
    ctx.lineTo(7.2, 21.8);
    ctx.lineTo(-7.2, 21.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Warm inner vent slits glowing softly in cupola hood
    ctx.fillStyle = "rgba(251, 191, 36, 0.78)";
    ctx.fillRect(-3.6, 19.2, 1.4, 1.1);
    ctx.fillRect(-0.7, 19.2, 1.4, 1.1);
    ctx.fillRect(2.2, 19.2, 1.4, 1.1);
    ctx.fillStyle = "rgba(253, 224, 71, 0.55)";
    ctx.fillRect(-6.8, 21.2, 13.6, 0.65);

    // 4. Illuminated warm amber glass core inside lantern (y = 22..38)
    const glassG = ctx.createRadialGradient(0, 30, 1.0, 0, 30, 8.6);
    glassG.addColorStop(0, "#fde047");
    glassG.addColorStop(0.36, "#d97706");
    glassG.addColorStop(0.75, "#92400e");
    glassG.addColorStop(1, "#451a03");
    ctx.fillStyle = glassG;
    ctx.fillRect(-5.8, 22.0, 11.6, 16.0);

    // Beveled glass reflection sheen & brass oil burner wick nozzle
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(-4.8, 23.0, 1.1, 13.5);
    ctx.fillStyle = "#92400e";
    ctx.fillRect(-2.4, 34.8, 4.8, 3.2);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-1.5, 34.8, 3.0, 1.2);
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(-0.4, 33.4, 0.8, 1.5);

    // 5. Animated flame inside glass using standardized flame halo
    const flameY = 33.4;
    const flameH = 6.4 + fl.stretch;
    drawBankStandardFlameHalo(ctx, fl.sway * 0.4, 29.8, 6.0, tSec, warmMix, 1.4);

    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(-2.0, flameY);
    ctx.quadraticCurveTo(-2.5, flameY - flameH * 0.48, fl.sway * 0.6, flameY - flameH);
    ctx.quadraticCurveTo(2.5, flameY - flameH * 0.48, 2.0, flameY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fffbeb";
    ctx.beginPath();
    ctx.moveTo(-0.95, flameY - 0.3);
    ctx.quadraticCurveTo(-1.2, flameY - flameH * 0.4, fl.sway * 0.35, flameY - flameH * 0.74);
    ctx.quadraticCurveTo(1.2, flameY - flameH * 0.4, 0.95, flameY - 0.3);
    ctx.closePath();
    ctx.fill();

    // 6. Protective forged metal grille / cage (drawn OVER glowing glass & flame)
    // Top & bottom guard collars
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-7.4, 21.5, 14.8, 1.8);
    ctx.fillRect(-7.2, 37.5, 14.4, 1.8);
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-7.4, 21.5, 14.8, 1.8);
    ctx.strokeRect(-7.2, 37.5, 14.4, 1.8);

    // Middle horizontal iron guard hoop across glass front
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(-6.2, 30.2);
    ctx.lineTo(6.2, 30.2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(253, 224, 71, 0.42)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-5.8, 29.7);
    ctx.lineTo(5.8, 29.7);
    ctx.stroke();

    // 4 Vertical wrought-iron grille bars (2 outer corner posts + 2 front bowed ribs)
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 1.45;
    [
      [-6.1, -6.5, -6.0],
      [-3.1, -3.4, -3.0],
      [3.1, 3.4, 3.0],
      [6.1, 6.5, 6.0],
    ].forEach(([tx, cxMid, bx]) => {
      ctx.beginPath();
      ctx.moveTo(tx, 22.8);
      ctx.quadraticCurveTo(cxMid, 30.0, bx, 38.0);
      ctx.stroke();
    });
    // Warm inner metallic catchlights along inner edges of grille ribs facing flame
    ctx.strokeStyle = "rgba(253, 224, 71, 0.52)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(-2.5, 23.4);
    ctx.quadraticCurveTo(-2.8, 30.0, -2.5, 37.4);
    ctx.moveTo(2.5, 23.4);
    ctx.quadraticCurveTo(2.8, 30.0, 2.5, 37.4);
    ctx.stroke();

    // Tiny brass collar rivets on cage corners
    ctx.fillStyle = "#f59e0b";
    [
      [-6.0, 22.4],
      [6.0, 22.4],
      [-5.8, 38.4],
      [5.8, 38.4],
    ].forEach(([rx, ry]) => {
      ctx.fillRect(rx - 0.5, ry - 0.5, 1.0, 1.0);
    });

    // 7. Cast-iron oil reservoir sump & drop finial (y = 39..44.5)
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.moveTo(-5.6, 39.2);
    ctx.lineTo(5.6, 39.2);
    ctx.lineTo(2.6, 42.2);
    ctx.lineTo(-2.6, 42.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = "#b45309";
    ctx.beginPath();
    ctx.moveTo(-1.3, 42.2);
    ctx.lineTo(1.3, 42.2);
    ctx.lineTo(0, 44.8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

function drawNotesTableCandelabra(ctx, x, y, animTime = 0) {
    ctx.save();
    ctx.translate(x, y);

    const tSec = (animTime || 0) * 0.5;
    drawBankStandardLightGlow(ctx, 0, -26, 8, -20, 66, tSec, BANK_LIGHT_WARM_MIX, 0.7);

    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const baseGrad = ctx.createLinearGradient(-7, 0, 7, 0);
    baseGrad.addColorStop(0, "#26190d");
    baseGrad.addColorStop(0.3, "#6e471d");
    baseGrad.addColorStop(0.6, "#b07b38");
    baseGrad.addColorStop(1, "#3d240f");
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(0, 1, 8.0, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-1.8, 1);
    ctx.lineTo(-1.3, -16);
    ctx.lineTo(1.3, -16);
    ctx.lineTo(1.8, 1);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -8, 3.0, 2.0, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a3816";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(-6, -9, -11, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(6, -8, 11, -16);
    ctx.stroke();

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "#8c5d26";
    ctx.beginPath();
    ctx.arc(-5.5, -8, 1.8, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5.5, -7, 1.8, Math.PI * 0.5, Math.PI * 2);
    ctx.stroke();

    const sconces = [
      { x: -11, y: -18, candleH: 14, type: "med", flamePhase: 0 },
      { x: 0, y: -22, candleH: 18, type: "tall", flamePhase: 1.2 },
      { x: 11, y: -16, candleH: 9, type: "short", flamePhase: 2.5 },
    ];

    sconces.forEach((sc) => {
      ctx.fillStyle = "#784c1e";
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, 4.2, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b07e3d";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      const cTopY = sc.y - sc.candleH;
      const cWidth = 3.0;
      const cGrad = ctx.createLinearGradient(sc.x - cWidth, cTopY, sc.x + cWidth, sc.y);
      cGrad.addColorStop(0, "#fefbf3");
      cGrad.addColorStop(0.5, "#ede1c7");
      cGrad.addColorStop(1, "#c9b897");
      ctx.fillStyle = cGrad;

      ctx.beginPath();
      ctx.moveTo(sc.x - cWidth * 0.5, sc.y);
      ctx.lineTo(sc.x - cWidth * 0.5, cTopY + 0.5);
      ctx.lineTo(sc.x + cWidth * 0.5, cTopY);
      ctx.lineTo(sc.x + cWidth * 0.5, sc.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fffbeb";
      ctx.beginPath();
      ctx.ellipse(sc.x, cTopY, cWidth * 0.55, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8f1de";
      if (sc.type === "short") {
        ctx.beginPath();
        ctx.moveTo(sc.x - 1.6, cTopY + 2);
        ctx.lineTo(sc.x - 2.0, sc.y - 1);
        ctx.arc(sc.x - 1.6, sc.y - 1, 0.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(sc.x + 1.0, cTopY + 1);
        ctx.lineTo(sc.x + 1.6, sc.y - 2.5);
        ctx.arc(sc.x + 1.3, sc.y - 2.5, 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sc.x + 2.8, sc.y + 0.5, 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (sc.type === "med") {
        ctx.beginPath();
        ctx.moveTo(sc.x - 1.5, cTopY + 2);
        ctx.lineTo(sc.x - 1.7, cTopY + 6);
        ctx.arc(sc.x - 1.5, cTopY + 6, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sc.x, cTopY);
      ctx.lineTo(sc.x + 0.3, cTopY - 2.3);
      ctx.stroke();

      const fl = computeBankFlameFlicker(tSec, sc.flamePhase);
      const sway = fl.sway;
      const flameY = cTopY - 2.3;
      const flameH = 5.5 + fl.stretch;

      drawBankStandardFlameHalo(
        ctx,
        sc.x + sway * 0.45,
        flameY - flameH * 0.48,
        5.2,
        tSec,
        BANK_LIGHT_WARM_MIX,
        sc.flamePhase,
      );

      ctx.fillStyle = "rgba(245, 158, 11, 0.88)";
      ctx.beginPath();
      ctx.moveTo(sc.x - 1.3, flameY);
      ctx.quadraticCurveTo(sc.x - 1.8, flameY - flameH * 0.5, sc.x + sway, flameY - flameH);
      ctx.quadraticCurveTo(sc.x + 1.8, flameY - flameH * 0.5, sc.x + 1.3, flameY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fffbeb";
      ctx.beginPath();
      ctx.moveTo(sc.x - 0.6, flameY);
      ctx.quadraticCurveTo(sc.x - 0.8, flameY - flameH * 0.4, sc.x + sway * 0.7, flameY - flameH * 0.7);
      ctx.quadraticCurveTo(sc.x + 0.8, flameY - flameH * 0.4, sc.x + 0.6, flameY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(99, 102, 241, 0.6)";
      ctx.beginPath();
      ctx.arc(sc.x, flameY, 0.7, 0, Math.PI);
      ctx.fill();
    });

    ctx.restore();
  }
export {drawSafeHangingLantern, drawNotesTableCandelabra, computeBankSparklePulses, drawBankSparkle};
