This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Color Theme

### HaloCall Custom Colors (Warm Wellness Palette)

**Sage Green (Primary)**
- Sage: `#8B9E8B`
- Sage Light: `#A8B8A8`
- Sage Dark: `#6B7E6B`

**Cream (Secondary)**
- Cream: `#F5F2EB`
- Cream Dark: `#EBE7DC`

**Terracotta (Accent)**
- Terracotta: `#C4836E`
- Terracotta Light: `#D4A090`
- Terracotta Dark: `#A4634E`

**Neutrals**
- Charcoal: `#2D2D2D`
- Warm Gray: `#8A8A8A`
- Warm Gray Light: `#B8B8B8`

### Light Theme
- Background: `#FDFCFA`
- Foreground: `#2D2D2D`
- Card: `#FFFFFF`
- Primary: `#8B9E8B`
- Secondary: `#F5F2EB`
- Accent: `#C4836E`
- Border: `#E8E5DE`

### Dark Theme
- Background: `#1A1A1A`
- Foreground: `#F5F2EB`
- Card: `#262626`
- Primary: `#A8B8A8`
- Secondary: `#2D2D2D`
- Accent: `#D4A090`
- Border: `#3D3D3D`

## Font Styles

This project uses Google Fonts loaded via [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) for optimal performance.

### Primary Font: DM Sans
- **Usage**: Body text and general content
- **CSS Variable**: `--font-dm-sans`
- **Tailwind Class**: `font-sans`
- **Weights**: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- **Display**: `swap` (for better performance)

### Heading Font: Nunito
- **Usage**: Headings (h1-h6)
- **CSS Variable**: `--font-nunito`
- **Tailwind Class**: `font-serif`
- **Weights**: 300 (Light), 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold), 900 (Black)
- **Display**: `swap` (for better performance)

### Font Usage
- Body text automatically uses DM Sans via `font-sans`
- All headings (h1-h6) automatically use Nunito via `font-serif`
- Fonts are self-hosted and optimized by Next.js for optimal loading performance

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Customer Setup Process

This section documents the process for setting up a customer after they successfully connect their Square account.

### What Happens Automatically

When a customer connects Square via OAuth, the callback handler automatically:

1. **Creates/updates a `merchant` record** - Stores encrypted Square access and refresh tokens
2. **Syncs `location` records** - Imports all active locations from the customer's Square account

After this, the customer sees the message:
> "The HaloCall team will connect your phone number and AI agent to your account within the next 24 hours."

### Manual Setup Steps

The following steps must be completed by the HaloCall team:

#### Prerequisites (External Systems)
Before running the setup script, ensure:
1. **ElevenLabs Agent** - A conversational AI agent has been created in ElevenLabs
2. **Phone Number** - A phone number has been provisioned and configured to route to the agent

#### Run the Interactive Setup Script

Use the provided setup script to configure the customer. The script is fully interactive and will guide you through the process:

```bash
npm run setup:customer
```

The script will:
1. **Display recently connected customers** - Select one using arrow keys
2. **Show synced locations** - View all locations from Square in a table format
3. **Prompt for configuration** - Enter the phone number and ElevenLabs agent ID
4. **Optionally grant user access** - Add location access for specific users
5. **Create the configuration** - Sets up `phone_number_config` and `agent_config` records

**Example session:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚀 HaloCall Customer Setup (Interactive)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 1: Select a customer to set up

? Choose a customer: (Use arrow keys)
❯ Acme Wellness Spa
  Downtown Fitness Center
  Mountain View Yoga Studio
```

#### Verify Setup

1. Log into the dashboard as the customer
2. Confirm the agent appears in the agent selector dropdown
3. Make a test call to the provisioned phone number

#### Step 5: Notify the Customer

Send a notification that their HaloCall AI agent is ready to receive calls.

### Database Schema Reference

```
organization (1)
    ├── merchant (1:1) ─────────── Square OAuth tokens
    └── location (1:many) ──────── Synced from Square
            └── phone_number_config (1:many) ─── Provisioned phone numbers
                    └── agent_config (1:1) ───── ElevenLabs agent link
```

### Optional: User Location Access

For organizations with non-admin users who need access to specific locations:

```sql
INSERT INTO user_location_access (clerk_organization_id, clerk_user_id, location_id)
VALUES ('<clerk_org_id>', '<clerk_user_id>', <location_id>);
```

Or use the setup script with the `--user-id` flag to grant access during setup.
