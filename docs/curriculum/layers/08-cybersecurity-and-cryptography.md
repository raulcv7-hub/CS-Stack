# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 08

La Capa 08 establece la protección, prueba, análisis defensivo/ofensivo e inmutabilidad de sistemas de información frente a adversarios activos. Su dominio abarca las primitivas criptográficas simétricas y asimétricas en tiempo constante, la gestión de claves, la criptografía poscuántica, las pruebas de cero conocimiento (ZKP), el análisis y explotación de corrupciones de memoria binaria (Buffer Overflows, Heap exploitation), la ingeniería inversa y descompilación de ejecutables, la seguridad de red perimetral (DPI, TLS 1.3, WireGuard, Zero Trust), la federación de identidades y sistemas de control de acceso (OAuth 2.0, OIDC, FIDO2) y la neutralización de vulnerabilidades en aplicaciones web.

---

## 🟢 CAPA 08: Cybersecurity, Cryptography & Systems Defense
*(Ruta en sistema de archivos: `content/08-cybersecurity-and-cryptography/`)*

---

### 01. `cryptographic-primitives` — Cryptographic Primitives

* **Assumed Prerequisites:** Análisis asintótico de `02: 01. asymptotic-algorithm-analysis` y sockets de transporte de `06: 03. transport-layer-protocols`.
* **Course Boundary:** Comienza en la vulnerabilidad de canales no seguros e interceptables y termina en la construcción de primitivas de cifrado simétrico, asimétrico y funciones hash ejecutadas en tiempo constante con gestión segura de claves.
* **Explicit Exclusions:** ❌ SIN análisis de exploits en código de software (tratados en `03`), ❌ SIN protocolos de túnel de red o VPNs (tratados en `05`).
* **Problema Disparador:** Comunicar datos sobre redes públicas expone los mensajes a intercepción, alteración y fugas por tiempos de ejecución en la CPU. ¿Cómo garantizamos confidencialidad, autenticidad e inmutabilidad usando matemática criptográfica implementada estrictamente en tiempo constante?
* **Dominio Técnico Comprehendido:** Cifrado simétrico (AES-GCM, ChaCha20-Poly1305), funciones hash criptográficas (SHA-2/3, BLAKE3), HMAC, criptografía de clave pública (RSA, ECC - Ed25519/X25519), intercambio de claves Diffie-Hellman, infraestructura PKI, certificados X.509, técnicas de programación criptográfica en tiempo constante (*Constant-Time Execution*) para prevenir fugas por canales laterales y fundamentos de Criptografía Poscuántica (PQC - Kyber/Dilithium).
* **Artefacto / Modelo Mental Entregable:** Un motor de primitivas criptográficas en tiempo constante con cifrado autenticado AES-GCM / ChaCha20-Poly1305 e intercambio de claves ECC Ed25519 resistente a ataques de tiempo de CPU.
* **Frontera de Entrada:** Comienza en el concepto de canal no seguro interceptado por un adversario.
* **Frontera de Salida:** Termina en la provisión de bloques constitutivos criptográficos probadamente seguros y libres de fugas por tiempo.
* **Dependencias Directas:** `02: 01. asymptotic-algorithm-analysis`, `06: 03. transport-layer-protocols`.

---

### 02. `zero-knowledge-proofs` — Zero-Knowledge Proofs

* **Assumed Prerequisites:** Primitivas asimétricas de `01. cryptographic-primitives` y Teoría de la Complejidad de `03: 08. computational-complexity-theory`.
* **Course Boundary:** Comienza en la necesidad de verificar la validez de un cálculo en privado y termina en la construcción e implementación de circuitos de Cero Conocimiento.
* **Explicit Exclusions:** ❌ SIN primitivas simétricas básicas (AES/SHA).
* **Problema Disparador:** ¿Cómo demostramos a un tercero que conocemos un secreto o que un cálculo se ejecutó correctamente sin revelar la información confidencial?
* **Dominio Técnico Comprehendido:** Pruebas de Cero Conocimiento (ZKP - ZK-SNARKs, ZK-STARKs, PLONK, circuitos aritméticos R1CS), Cifrado Homomórfico (FHE), Computación Segura Multipartita (SMPC), Compromisos de Pedersen y Privacidad Diferencial.
* **Artefacto / Modelo Mental Entregable:** Un circuito de verificación criptográfica ZK-SNARK capaz de verificar un cálculo sin revelar los insumos.
* **Frontera de Entrada:** Comienza en la necesidad de demostrar que un cálculo se ejecutó correctamente sin revelar los datos de entrada.
* **Frontera de Salida:** Termina en la implementación de circuitos criptográficos verificables para privacidad en sistemas distribuidos.
* **Dependencias Directas:** `03: 08. computational-complexity-theory`, `01. cryptographic-primitives`.

---

### 03. `software-vulnerability-analysis` — Software Vulnerability Analysis

* **Assumed Prerequisites:** Ensamblador de `00: 06. assembly-language-mechanics`, asignadores Heap de `01: 03. heap-memory-allocators`, kernel de `04: 01. operating-system-kernels` y enlazado binario de `05: 02. binary-linking-mechanics`.
* **Course Boundary:** Comienza en el análisis de binarios ejecutables vulnerables y termina en la construcción de pruebas de concepto (Exploits) de corrupción de memoria y despliegue de mitigaciones de sistema/hardware.
* **Explicit Exclusions:** ❌ SIN criptografía matemática pura, ❌ SIN vulnerabilidades de capa de aplicación web (XSS/SQLi, tratadas en `07`).
* **Problema Disparador:** Los errores de código en la gestión de memoria o desbordamientos de enteros permiten a atacantes secuestrar el flujo de control del programa. ¿Cómo detectamos, explotamos y mitigamos estas vulnerabilidades en binarios nativos?
* **Dominio Técnico Comprehendido:** Corrupción de memoria en la pila (*Buffer Overflow*), corrupción en el heap (*Use-After-Free, Double Free*), desbordamientos de enteros (*Integer Overflows / Underflows*), mitigaciones del sistema (ASLR, DEP/NX, Stack Canaries), técnicas de retorno a libc (*ROP - Return-Oriented Programming*) y análisis dinámico mediante *Fuzzing*.
* **Artefacto / Modelo Mental Entregable:** Una prueba de concepto (Exploit) de secuestro de flujo de control por Buffer Overflow e Integer Overflow, y la implementación de mitigaciones ASLR/Stack Canaries.
* **Frontera de Entrada:** Comienza en el análisis de código ejecutable vulnerable en memoria.
* **Frontera de Salida:** Termina en la construcción e ingeniería de pruebas de concepto de mitigación de corrupción de memoria.
* **Dependencias Directas:** `00: 06. assembly-language-mechanics`, `01: 03. heap-memory-allocators`, `04: 01. operating-system-kernels`, `05: 02. binary-linking-mechanics`.

---

### 04. `binary-reverse-engineering` — Binary Reverse Engineering

* **Assumed Prerequisites:** Formato de ejecutable `ELF` y símbolos de `05: 02. binary-linking-mechanics` y vulnerabilidades de memoria de `03. software-vulnerability-analysis`.
* **Course Boundary:** Comienza en la toma de un ejecutable binario desconocido sin código fuente y termina en la descompilación y reconstrucción completa del flujo de control.
* **Explicit Exclusions:** ❌ SIN desarrollo de exploits web.
* **Problema Disparador:** Ante un archivo binario sospechoso o ejecutable sin código fuente, ¿cómo reconstruimos su lógica de control, datos y comportamiento interno?
* **Dominio Técnico Comprehendido:** Análisis estático y dinámico de binarios ejecutables sin código fuente, desensamblado, descompilación en Ghidra/IDA, reconstrucción del CFG, ejecución simbólica, desempaquetado de binarios y análisis de ofuscación.
* **Artefacto / Modelo Mental Entregable:** Un mapa de flujo de control descompilado e ingeniería inversa de un binario ofuscado usando Ghidra y ejecución simbólica.
* **Frontera de Entrada:** Comienza en la toma de un archivo ejecutable binario desconocido.
* **Frontera de Salida:** Termina en la reconstrucción del modelo mental y funcional del programa original.
* **Dependencias Directas:** `05: 02. binary-linking-mechanics`, `03. software-vulnerability-analysis`.

---

### 05. `network-security-mechanics` — Network Security Mechanics

* **Assumed Prerequisites:** Capas de red/transporte de `06: 03. transport-layer-protocols` y primitivas criptográficas de `01. cryptographic-primitives`.
* **Course Boundary:** Comienza en el filtrado de paquetes en la interfaz de red y termina en la construcción de redes de confianza cero (*Zero Trust*) con túneles TLS 1.3, cortafuegos DPI y VPNs.
* **Explicit Exclusions:** ❌ SIN criptografía teórica aislada (tratada en `01`).
* **Problema Disparador:** El tráfico malicioso cruza la interfaz de red para saturar, penetrar o espiar la infraestructura. ¿Cómo filtramos paquetes en tiempo real, inspeccionamos conexiones y blindamos los canales de transporte mediante TLS 1.3 y VPNs?
* **Dominio Técnico Comprehendido:** Seguridad en infraestructuras de red, protocolo de canal seguro TLS 1.3 Handshake, cortafuegos de inspección profunda de paquetes (*DPI - Deep Packet Inspection*), IDS/IPS, VLANs, mitigación de DDoS (SYN Floods, Amplificación DNS), VPNs (IPsec, WireGuard) y arquitectura Zero Trust.
* **Artefacto / Modelo Mental Entregable:** Un cortafuegos de inspección profunda de paquetes (DPI) con túnel cifrado WireGuard, canal autenticado TLS 1.3 y defensa anti-DDoS.
* **Frontera de Entrada:** Comienza en el paquete de red malicioso cruzando la interfaz.
* **Frontera de Salida:** Termina en la protección de perímetros y redes de confianza cero.
* **Dependencias Directas:** `06: 03. transport-layer-protocols`, `01. cryptographic-primitives`.

---

### 06. `identity-access-systems` — Identity Access Systems

* **Assumed Prerequisites:** Protocolos de aplicación de `06: 05. application-layer-protocols` y firmas/hash de `01. cryptographic-primitives`.
* **Course Boundary:** Comienza en la autenticación del usuario y termina en la federación de identidades y autorización de grano fino para llamadas a recursos.
* **Explicit Exclusions:** ❌ SIN ciberseguridad de red física.
* **Problema Disparador:** Verificar la identidad de usuarios y delegar permisos entre servicios heterogéneos de forma insegura produce accesos no autorizados. ¿Cómo gestionamos autenticación y autorización segura?
* **Dominio Técnico Comprehendido:** Autenticación (contraseñas, Argon2, MFA, FIDO2/WebAuthn), tokens de acceso (JWT), protocolos de autorización y federación (OAuth 2.0, OpenID Connect, SAML) y modelos de control de acceso (RBAC, ABAC).
* **Artefacto / Modelo Mental Entregable:** Un servidor de identidad OAuth 2.0 / OpenID Connect con emisión de JWTs firmados y autenticación multifactor FIDO2.
* **Frontera de Entrada:** Comienza en la verificación de la identidad de un usuario o servicio.
* **Frontera de Salida:** Termina en la emisión de decisiones de autorización de grano fino para llamadas a recursos.
* **Dependencias Directas:** `06: 05. application-layer-protocols`, `01. cryptographic-primitives`.

---

### 07. `web-application-security` — Web Application Security

* **Assumed Prerequisites:** Protocolos de Aplicación HTTP de `06: 05. application-layer-protocols` y Sistemas de Identidad de `06. identity-access-systems`.
* **Course Boundary:** Comienza en la vulnerabilidad de la arquitectura web cliente-servidor distribuida y termina en la neutralización defensiva de vectores de ataque de capa de aplicación.
* **Explicit Exclusions:** ❌ SIN vulnerabilidades de corrupción de memoria en binarios C/Assembly (`Buffer Overflow`/`ROP`).
* **Problema Disparador:** El navegador web ejecuta código JavaScript no confiable y confía implícitamente en el origen de las peticiones. ¿Cómo interceptamos, explotamos y mitigamos ataques que manipulan el estado del cliente, las cookies y las consultas del servidor?
* **Dominio Técnico Comprehendido:** Cross-Site Scripting (XSS: Stored, Reflected, DOM), Cross-Site Request Forgery (CSRF), Server-Side Request Forgery (SSRF), Inyección SQL (SQLi), Política del Mismo Origen (*Same-Origin Policy - SOP*), Intercambio de Recursos de Origen Cruzado (CORS), Content Security Policy (CSP), banderas de seguridad en Cookies (`HttpOnly`, `SameSite`, `Secure`) y Deserialización Insegura.
* **Artefacto / Modelo Mental Entregable:** Un entorno de prueba de vulnerabilidades de aplicación web con vectores de ataque XSS/CSRF/SQLi e implementación de defensas mediante CSP, cookies SameSite y parametrización estricta.
* **Frontera de Entrada:** Comienza en la superficie de exposición de las aplicaciones expuestas por HTTP/Web.
* **Frontera de Salida:** Termina en la protección integral de aplicaciones web mediante defensas multinivel.
* **Dependencias Directas:** `06: 05. application-layer-protocols`, `06. identity-access-systems`.