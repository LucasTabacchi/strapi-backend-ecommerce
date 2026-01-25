// backend/src/api/promotion/services/promotion.ts
import { factories } from "@strapi/strapi";

type CartItemInput = { id?: number | null; documentId?: string | null; qty: number };
type QuoteInput = { items: CartItemInput[]; coupon?: string; shipping?: number };

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function num(v: any, def = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}
function normStr(s: any) {
  return String(s ?? "").trim();
}
function lower(s: any) {
  return normStr(s).toLowerCase();
}

function priceWithOff(price: number, off?: number) {
  const hasOff = typeof off === "number" && off > 0;
  return hasOff ? Math.round(price * (1 - off / 100)) : price;
}

export default factories.createCoreService("api::promotion.promotion", ({ strapi }) => ({
  async quote(input: QuoteInput) {
    try {
      const now = new Date();
      const coupon = normStr(input.coupon);

      // ✅ LOG 1: Ver qué cupón llega
      console.log("[QUOTE DEBUG] Cupón recibido:", coupon);

      // 1) Normalizar items
      const rawItems = asArray<CartItemInput>(input.items)
        .map((it) => {
          const id = Number(it?.id);
          const documentId = normStr(it?.documentId) || null;
          const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
          return {
            id: Number.isFinite(id) && id > 0 ? id : null,
            documentId,
            qty,
          };
        })
        .filter((it) => it.id != null || !!it.documentId);

      if (!rawItems.length) {
        return { subtotal: 0, discountTotal: 0, total: 0, appliedPromotions: [] };
      }

      // 2) Traer productos reales
      const ids = Array.from(
        new Set(rawItems.map((x) => x.id).filter((x): x is number => x != null))
      );
      const docIds = Array.from(
        new Set(rawItems.map((x) => x.documentId).filter((x): x is string => !!x))
      );

      const or: any[] = [];
      ids.forEach((id) => or.push({ id: { $eq: id } }));
      docIds.forEach((d) => or.push({ documentId: { $eq: d } }));

      const products = await strapi.entityService.findMany("api::product.product", {
        filters: or.length ? { $or: or } : undefined,
        pagination: { pageSize: Math.max(200, ids.length + docIds.length) },
      });

      const byId = new Map<number, any>();
      const byDoc = new Map<string, any>();

      for (const p of asArray(products)) {
        if (p?.id) byId.set(p.id, p);
        const did = normStr((p as any)?.documentId ?? (p as any)?.document_id);
        if (did) byDoc.set(did, p);
      }

      const lines = rawItems
        .map((it) => {
          const p =
            (it.id != null ? byId.get(it.id) : null) ||
            (it.documentId ? byDoc.get(it.documentId) : null);

          if (!p) return null;

          const unit = priceWithOff(num((p as any).price, 0), num((p as any).off, 0));
          const lineSubtotal = unit * it.qty;

          return {
            id: p.id,
            documentId: normStr((p as any)?.documentId ?? (p as any)?.document_id) || null,
            qty: it.qty,
            title: (p as any).title,
            slug: (p as any).slug,
            category: normStr((p as any).category),
            unit,
            lineSubtotal,
          };
        })
        .filter(Boolean) as any[];

      const subtotal = Math.round(lines.reduce((acc, l) => acc + l.lineSubtotal, 0));
      const totalItems = lines.reduce((acc, l) => acc + l.qty, 0);
      const totalBoxes = totalItems;

      // 3) Promos activas
      const shipping = num(input.shipping, 0);

      // ✅ PRIMERO: Traer TODAS las promociones sin filtros para ver qué hay
      console.log("[QUOTE DEBUG] === PASO 1: Buscando TODAS las promociones ===");
      const allPromos = await strapi.entityService.findMany("api::promotion.promotion", {
        pagination: { pageSize: 200 },
      });
      console.log("[QUOTE DEBUG] Total promociones en BD:", allPromos.length);
      
      if (allPromos.length > 0) {
        asArray(allPromos).forEach((p: any) => {
          console.log(`  - ID: ${p.id}`);
          console.log(`    Nombre: ${p.name}`);
          console.log(`    Código: ${p.code}`);
          console.log(`    Enabled: ${p.enabled}`);
          console.log(`    PublishedAt: ${p.publishedAt}`);
          console.log(`    StartAt: ${p.startAt}`);
          console.log(`    EndAt: ${p.endAt}`);
          console.log(`    RequiresCoupon: ${p.requiresCoupon}`);
          console.log(`    DiscountType: ${p.discountType}`);
          console.log(`    DiscountValue: ${p.discountValue}`);
          console.log("    ---");
        });
      }

      // ✅ SEGUNDO: Aplicar filtros uno por uno
      console.log("[QUOTE DEBUG] === PASO 2: Aplicando filtros ===");
      
      const promos = await strapi.entityService.findMany("api::promotion.promotion", {
        filters: {
          enabled: true,
          publishedAt: { $notNull: true },
          $and: [
            { $or: [{ startAt: null }, { startAt: { $lte: now.toISOString() } }] },
            { $or: [{ endAt: null }, { endAt: { $gte: now.toISOString() } }] },
          ],
        },
        sort: [{ priority: "asc" }, { id: "asc" }],
        pagination: { pageSize: 200 },
      });

      // ✅ LOG 2: Ver todas las promos activas
      console.log("[QUOTE DEBUG] Promociones activas encontradas después de filtros:", promos.length);
      asArray(promos).forEach((p: any) => {
        console.log(`  - ID: ${p.id}, Nombre: ${p.name}, Código: ${p.code}, RequiresCoupon: ${p.requiresCoupon}`);
      });

      // 4) Evaluar promos
      const candidates = asArray(promos)
        .map((p: any) => {
          const requiresCoupon = !!p.requiresCoupon;
          const code = normStr(p.code);

          // ✅ LOG 3: Ver cada evaluación
          if (requiresCoupon) {
            console.log(`[QUOTE DEBUG] Evaluando promo con cupón: ${code}`);
            console.log(`  - Cupón ingresado: "${coupon}"`);
            console.log(`  - Cupón de promo: "${code}"`);
            console.log(`  - Coinciden: ${lower(coupon) === lower(code)}`);
            
            if (!coupon) {
              console.log(`  ❌ Descartada: no hay cupón ingresado`);
              return null;
            }
            if (lower(coupon) !== lower(code)) {
              console.log(`  ❌ Descartada: cupón no coincide`);
              return null;
            }
            console.log(`  ✅ Cupón válido!`);
          }

          const usageLimitTotal = p.usageLimitTotal == null ? null : num(p.usageLimitTotal, 0);
          const usedCount = num(p.usedCount, 0);
          if (usageLimitTotal != null && usageLimitTotal > 0 && usedCount >= usageLimitTotal) {
            console.log(`  ❌ Descartada: límite de uso alcanzado (${usedCount}/${usageLimitTotal})`);
            return null;
          }

          const minSubtotal = p.minSubtotal == null ? null : num(p.minSubtotal, 0);
          if (minSubtotal != null && minSubtotal > 0 && subtotal < minSubtotal) {
            console.log(`  ❌ Descartada: subtotal insuficiente (${subtotal} < ${minSubtotal})`);
            return null;
          }

          const minItems = p.minItems == null ? null : num(p.minItems, 0);
          if (minItems != null && minItems > 0 && totalItems < minItems) {
            console.log(`  ❌ Descartada: items insuficientes (${totalItems} < ${minItems})`);
            return null;
          }

          const minBoxes = p.minBoxes == null ? null : num(p.minBoxes, 0);
          if (minBoxes != null && minBoxes > 0 && totalBoxes < minBoxes) {
            console.log(`  ❌ Descartada: cajas insuficientes (${totalBoxes} < ${minBoxes})`);
            return null;
          }

          const appliesTo = normStr(p.appliesTo) || "order";
          const categories = asArray<string>(p.categories).map(normStr).filter(Boolean);
          const excludedCategories = asArray<string>(p.excludedCategories).map(normStr).filter(Boolean);
          const productIds = asArray<number>(p.productIds)
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x));
          const excludedProductIds = asArray<number>(p.excludedProductIds)
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x));

          const eligibleLines = lines.filter((l) => {
            if (excludedProductIds.includes(l.id)) return false;
            if (excludedCategories.map(lower).includes(lower(l.category))) return false;
            if (appliesTo === "order") return true;
            if (appliesTo === "category") {
              if (!categories.length) return false;
              return categories.map(lower).includes(lower(l.category));
            }
            if (appliesTo === "product") {
              if (!productIds.length) return false;
              return productIds.includes(l.id);
            }
            return true;
          });

          const eligibleSubtotal = Math.round(
            eligibleLines.reduce((acc, l) => acc + l.lineSubtotal, 0)
          );
          
          if (eligibleSubtotal <= 0) {
            console.log(`  ❌ Descartada: subtotal elegible = 0`);
            return null;
          }

          const discountType = normStr(p.discountType) || "percent";
          const discountValue = num(p.discountValue, 0);
          const maxDiscount = p.maxDiscount == null ? null : num(p.maxDiscount, 0);

          let amount = 0;
          if (discountType === "percent") amount = Math.round(eligibleSubtotal * (discountValue / 100));
          else if (discountType === "fixed") amount = Math.round(Math.min(discountValue, eligibleSubtotal));
          else if (discountType === "free_shipping") amount = Math.round(Math.min(shipping, eligibleSubtotal));

          if (maxDiscount != null && maxDiscount > 0) amount = Math.min(amount, Math.round(maxDiscount));
          
          if (amount <= 0) {
            console.log(`  ❌ Descartada: amount = 0`);
            return null;
          }

          console.log(`  ✅ CANDIDATA: ${p.name}, Descuento: $${amount}`);

          return {
            id: p.id,
            name: p.name,
            code: code || null,
            priority: num(p.priority, 100),
            combinable: !!p.combinable,
            stackableWithExclusive: !!p.stackableWithExclusive,
            amount,
            meta: { discountType, discountValue, appliesTo },
            requiresCoupon,
          };
        })
        .filter(Boolean) as any[];

      // ✅ LOG 4: Ver candidatas finales
      console.log("[QUOTE DEBUG] Candidatas finales:", candidates.length);
      candidates.forEach(c => {
        console.log(`  - ${c.name} (${c.code || 'sin código'}): $${c.amount}`);
      });

      // 5) Regla negocio: si hay cupón => NO se suman otras
      let applied: any[] = [];
      let discountTotal = 0;

      const couponCandidates = candidates.filter((c) => c.requiresCoupon);
      
      // ✅ LOG 5: Ver si hay candidatas con cupón
      console.log("[QUOTE DEBUG] Candidatas que requieren cupón:", couponCandidates.length);
      
      if (coupon && couponCandidates.length) {
        couponCandidates.sort(
          (a, b) => b.amount - a.amount || a.priority - b.priority || a.id - b.id
        );
        applied = [couponCandidates[0]];
        discountTotal = couponCandidates[0].amount;
        console.log("[QUOTE DEBUG] ✅ Cupón aplicado:", couponCandidates[0].name, `$${discountTotal}`);
      } else {
        console.log("[QUOTE DEBUG] ❌ No se aplicó cupón");
        const exclusives = candidates.filter((c) => !c.combinable);
        const combinables = candidates.filter((c) => c.combinable);

        if (exclusives.length) {
          exclusives.sort(
            (a, b) => b.amount - a.amount || a.priority - b.priority || a.id - b.id
          );
          const best = exclusives[0];
          applied.push(best);
          discountTotal += best.amount;

          const stackers = combinables.filter((c) => c.stackableWithExclusive);
          stackers.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
          for (const c of stackers) {
            applied.push(c);
            discountTotal += c.amount;
          }
        } else {
          combinables.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
          for (const c of combinables) {
            applied.push(c);
            discountTotal += c.amount;
          }
        }
      }

      discountTotal = Math.min(discountTotal, subtotal);
      const total = subtotal - discountTotal;

      const result = {
        subtotal,
        discountTotal,
        total,
        appliedPromotions: applied.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          amount: p.amount,
          meta: p.meta,
        })),
      };

      // ✅ LOG 6: Resultado final
      console.log("[QUOTE DEBUG] Resultado final:", JSON.stringify(result, null, 2));

      return result;
    } catch (err: any) {
      strapi.log.error(`[promotions.quote] error: ${err?.message || err}`);
      throw err;
    }
  },
}));