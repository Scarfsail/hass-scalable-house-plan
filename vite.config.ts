import { defineConfig } from "vite";
//import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const isProduction = mode === 'production';
    return {
       // root: 'src',
        build: {
            lib: {
                entry: "./src/app.tsx",
                formats: ["es"],
                fileName: () => `scalable-house-plan-${isProduction ? "prod" : "dev"}.js`, // Force .js extension                
            },
            emptyOutDir: false,
            // Relative to the root
            outDir: './dist',
            assetsDir: "compiled",
            sourcemap: !isProduction, // Enable source maps in development mode
            minify: isProduction, // Minify only in production mode
            rollupOptions: {
                output: {
                    inlineDynamicImports: true,
                    manualChunks: undefined
                }
            }
        },
        /*
        esbuild: {
            legalComments: "none",
        },*/
        plugins: [
            //react(),
        ],
        define: {
            "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development"),
        }
    }
});
