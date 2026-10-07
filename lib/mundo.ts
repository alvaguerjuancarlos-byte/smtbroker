// Mundo demo vs. mundo real (Bloque 1 del plan V6.3, migración 20261008000000_mundos_demo_real.sql).
// Una cuenta real solo ve datos reales y una cuenta demo solo ve datos demo -- el piloto con
// brokers reales no debe cruzarse con Diego, Patricia y las propiedades ficticias del video.
//
// activos.es_demo y perfiles_intencion.es_demo los fija un trigger al crearse (a partir de
// usuarios.es_demo de quien los crea) y no se pueden cambiar desde la aplicación. Las rutas que
// corren con supabaseAdmin (que ignora la RLS) filtran a mano con esto.

/** Dos o más registros son del mismo mundo si coinciden sus es_demo (null cuenta como real). */
export const mismoMundo = (...demos: (boolean | null | undefined)[]) =>
  demos.every((d) => !!d === !!demos[0])
