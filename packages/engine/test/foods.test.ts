import { describe, expect, it } from 'vitest';
import { FOODS, buscaAlimentos, terminosDeBusqueda } from '../src/foods.js';
import type { Food } from '../src/types.js';

function ids(resultado: Food[]): string[] {
  return resultado.map((f) => f.id);
}

describe('buscaAlimentos', () => {
  it('encuentra el yogur griego aunque se escriba "Yogurt Griego"', () => {
    // El bug que lo motivo: el catalogo dice "Yogur griego natural 0%" y quien
    // busca escribe "yogurt", que es como se lee en el bote.
    expect(ids(buscaAlimentos('Yogurt Griego', FOODS))).toContain('yogur_griego_0');
  });

  it('ignora acentos y mayusculas', () => {
    expect(ids(buscaAlimentos('ATÚN', FOODS))).toContain('atun_agua');
    expect(ids(buscaAlimentos('atun', FOODS))).toContain('atun_agua');
  });

  it('aguanta plurales simples', () => {
    expect(ids(buscaAlimentos('huevos', FOODS))).toContain('huevo_entero');
    expect(ids(buscaAlimentos('frijoles', FOODS))).toContain('frijol_negro');
  });

  it('acepta el sinonimo regional', () => {
    expect(ids(buscaAlimentos('palta', FOODS))).toContain('aguacate');
    expect(ids(buscaAlimentos('patata', FOODS))).toContain('papa');
    expect(ids(buscaAlimentos('banana', FOODS))).toContain('platano');
    expect(ids(buscaAlimentos('mani', FOODS))).toContain('crema_cacahuate');
    expect(ids(buscaAlimentos('pechuga', FOODS))).toContain('pechuga_pollo');
  });

  it('scoop y whey llevan a la proteina en polvo', () => {
    expect(ids(buscaAlimentos('scoop', FOODS))).toContain('whey_isolate');
    expect(ids(buscaAlimentos('proteina en polvo', FOODS))).toContain('whey_isolate');
  });

  it('sin texto devuelve el catalogo completo y no inventa resultados', () => {
    expect(buscaAlimentos('   ', FOODS)).toHaveLength(FOODS.length);
    expect(buscaAlimentos('zzzqqq', FOODS)).toHaveLength(0);
  });

  it('respeta el orden del catalogo que recibe', () => {
    const catalogo = FOODS.filter((f) => f.role === 'fruta');
    const resultado = buscaAlimentos('a', catalogo);
    expect(resultado).toEqual(catalogo.filter((f) => resultado.includes(f)));
  });

  it('los terminos de un alimento traen su nombre, su id, sus tags y sus sinonimos', () => {
    const yogur = FOODS.find((f) => f.id === 'yogur_griego_0');
    expect(yogur).toBeDefined();
    const terminos = terminosDeBusqueda(yogur as Food);
    expect(terminos).toContain('yogur');
    expect(terminos).toContain('yogurt');
  });
});
