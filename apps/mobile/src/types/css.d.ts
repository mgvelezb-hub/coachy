// Los .css solo existen en el target web de Expo; tsc necesita saber que importan.
// Expo los genera en expo-env.d.ts al correr `expo start`, pero ese archivo está
// gitignoreado — esta declaración deja el typecheck verde en frío.
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}

declare module "*.css";
