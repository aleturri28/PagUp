# PagUp - Progetto Expo React Native

## Vision
App wallet educativo per persone con disabilità cognitiva. Permette di gestire denaro digitale con feedback aptico, contrasto elevato e touch target >48dp.

## Tech Stack
- **Frontend**: Expo (Managed Workflow) + TypeScript
- **Backend**: Supabase (Auth + Database)
- **State**: Zustand con persistenza
- **Navigazione**: React Navigation Stack
- **UI**: Componenti custom (StyleSheet), niente librerie UI

## Core Logic

### Wallet
- Tipo `MoneyItem`: `{ id: string, value: number, type: 'coin' | 'bill', imageUri: string }`
- Stato: `MoneyItem[]` gestito da Zustand store
- Persistenza locale attiva

### Accessibilità (OBBLIGATORIO)
- Ogni componente interattivo: `accessible={true}` + `accessibilityLabel`
- Touch target minimo 48dp
- Contrasto elevato (WCAG AAA)
- Feedback aptico su azioni

### Navigazione
- Stack navigator con tasto "Indietro" (eccetto home)
- Screen separati: `/tutor` e `/student`

## Regole di Codifica
- No `any` - tipi TypeScript rigorosi
- Separazione netta: hooks (logica) ≠ componenti (UI)
- Niente librerie UI preconfezionate

## Struttura Cartelle
```
/src
  /api          # Supabase client
  /components   # Componenti riutilizzabili
  /hooks        # Custom hooks (logica)
  /screens
    /tutor      # Screen area tutor
    /student    # Screen area student
  /store        # Zustand stores
  /theme        # Colori, spacing, accessibility tokens
  /assets/money # Immagini monete/banconote
```
