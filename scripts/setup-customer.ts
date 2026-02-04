#!/usr/bin/env npx ts-node

/**
 * Customer Setup Script (Interactive)
 *
 * This script sets up a customer after they've connected their Square account.
 * It creates the phone_number_config and agent_config records to link an
 * ElevenLabs agent to a phone number for a specific location.
 *
 * Prerequisites:
 * - Customer has connected Square (merchant and location records exist)
 * - ElevenLabs agent has been created
 * - Phone number has been provisioned
 *
 * Usage:
 *   npm run setup:customer
 *
 * The script will interactively guide you through the setup process.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { select, input, confirm } from '@inquirer/prompts'

// Create Prisma client with pg adapter
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({ adapter })
}

const prisma = createPrismaClient()

// Types for database queries
interface RecentCustomer {
  clerk_organization_id: string
  clerk_organization_name: string
  merchant_id: string
  is_sandbox: boolean
  created_at: Date
  is_configured: boolean
}

interface LocationInfo {
  id: bigint
  merchant_location_id: string
  timezone: string
  address: {
    address_line_1?: string
    locality?: string
    administrative_district_level_1?: string
    postal_code?: string
  }
  has_phone_config: boolean
}

// Helper to format date
function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Helper to format address
function formatAddress(address: LocationInfo['address']): string {
  if (!address || Object.keys(address).length === 0) {
    return 'No address'
  }
  const parts = [
    address.address_line_1,
    address.locality,
    address.administrative_district_level_1,
    address.postal_code,
  ].filter(Boolean)
  return parts.join(', ') || 'No address'
}

// Step 1: Fetch and display recently connected customers
async function fetchRecentCustomers(): Promise<RecentCustomer[]> {
  const customers = await prisma.$queryRaw<RecentCustomer[]>`
    SELECT 
      o.clerk_organization_id,
      o.clerk_organization_name,
      m.merchant_id,
      m.is_sandbox,
      m.created_at,
      EXISTS (
        SELECT 1 FROM location l
        JOIN phone_number_config pnc ON pnc.location_id = l.id
        JOIN agent_config ac ON ac.phone_number_id = pnc.id
        WHERE l.clerk_organization_id = o.clerk_organization_id
      ) as is_configured
    FROM merchant m
    JOIN organization o ON o.clerk_organization_id = m.clerk_organization_id
    WHERE m.is_active = true
    ORDER BY m.created_at DESC
    LIMIT 20
  `
  return customers
}

// Step 2: Fetch locations for an organization
async function fetchLocations(orgId: string): Promise<LocationInfo[]> {
  const locations = await prisma.$queryRaw<LocationInfo[]>`
    SELECT 
      l.id,
      l.merchant_location_id,
      l.timezone,
      l.address,
      EXISTS (
        SELECT 1 FROM phone_number_config pnc
        WHERE pnc.location_id = l.id
      ) as has_phone_config
    FROM location l
    WHERE l.clerk_organization_id = ${orgId}
    ORDER BY l.id
  `
  return locations
}

// Check if phone number already exists
async function phoneNumberExists(phoneNumber: string): Promise<boolean> {
  const existing = await prisma.phone_number_config.findUnique({
    where: { phone_number: phoneNumber },
  })
  return existing !== null
}

// Validate E.164 phone number format
function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone)
}

// Main interactive flow
async function main() {
  console.log('\n')
  console.log('━'.repeat(60))
  console.log('  🚀 HaloCall Customer Setup (Interactive)')
  console.log('━'.repeat(60))
  console.log('\n')

  try {
    // ─────────────────────────────────────────────────────────────
    // STEP 1: Select a customer
    // ─────────────────────────────────────────────────────────────
    console.log('📋 Step 1: Select a customer to set up\n')

    const customers = await fetchRecentCustomers()

    if (customers.length === 0) {
      console.log('❌ No customers found. Make sure customers have connected Square first.\n')
      process.exit(1)
    }

    // Build choices for the select prompt
    const customerChoices = customers.map((c) => {
      const status = c.is_configured ? '✅ Configured' : '⏳ Needs Setup'
      const env = c.is_sandbox ? '🧪 Sandbox' : '🏭 Production'
      const date = formatDate(c.created_at)

      return {
        name: `${c.clerk_organization_name}`,
        value: c,
        description: `${status} | ${env} | Connected: ${date}`,
      }
    })

    const selectedCustomer = await select({
      message: 'Choose a customer:',
      choices: customerChoices,
      pageSize: 10,
    })

    console.log('\n')
    console.log('  Selected:', selectedCustomer.clerk_organization_name)
    console.log('  Org ID:  ', selectedCustomer.clerk_organization_id)
    console.log('  Merchant:', selectedCustomer.merchant_id)
    console.log('  Env:     ', selectedCustomer.is_sandbox ? 'Sandbox' : 'Production')
    console.log('\n')

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Verify locations
    // ─────────────────────────────────────────────────────────────
    console.log('📍 Step 2: Verify synced locations\n')

    const locations = await fetchLocations(selectedCustomer.clerk_organization_id)

    if (locations.length === 0) {
      console.log('❌ No locations found for this organization.')
      console.log('   The customer may need to re-connect Square or check their Square account.\n')
      process.exit(1)
    }

    // Display locations in a table format
    console.log('  ┌' + '─'.repeat(6) + '┬' + '─'.repeat(28) + '┬' + '─'.repeat(22) + '┬' + '─'.repeat(12) + '┐')
    console.log('  │' + ' ID   ' + '│' + ' Merchant Location ID       ' + '│' + ' Address              ' + '│' + ' Status     ' + '│')
    console.log('  ├' + '─'.repeat(6) + '┼' + '─'.repeat(28) + '┼' + '─'.repeat(22) + '┼' + '─'.repeat(12) + '┤')

    for (const loc of locations) {
      const id = String(loc.id).padEnd(4)
      const merchantLocId = loc.merchant_location_id.substring(0, 26).padEnd(26)
      const address = formatAddress(loc.address).substring(0, 20).padEnd(20)
      const status = loc.has_phone_config ? '✅ Ready   ' : '⏳ Pending '

      console.log(`  │ ${id} │ ${merchantLocId} │ ${address} │ ${status}│`)
    }

    console.log('  └' + '─'.repeat(6) + '┴' + '─'.repeat(28) + '┴' + '─'.repeat(22) + '┴' + '─'.repeat(12) + '┘')
    console.log('\n')

    // Filter to only unconfigured locations
    const unconfiguredLocations = locations.filter((l) => !l.has_phone_config)

    if (unconfiguredLocations.length === 0) {
      console.log('✅ All locations are already configured!')
      const continueAnyway = await confirm({
        message: 'Do you want to add another phone number to an existing location?',
        default: false,
      })
      if (!continueAnyway) {
        console.log('\n👋 Exiting. No changes made.\n')
        process.exit(0)
      }
    }

    // Select a location
    const locationChoices = (unconfiguredLocations.length > 0 ? unconfiguredLocations : locations).map((l) => ({
      name: `Location ${l.id}: ${formatAddress(l.address).substring(0, 40)}`,
      value: l,
      description: `Timezone: ${l.timezone} | ${l.has_phone_config ? 'Already configured' : 'Needs setup'}`,
    }))

    const selectedLocation = await select({
      message: 'Select a location to configure:',
      choices: locationChoices,
    })

    console.log('\n')
    console.log('  Selected Location:', selectedLocation.id.toString())
    console.log('  Merchant Location:', selectedLocation.merchant_location_id)
    console.log('  Timezone:         ', selectedLocation.timezone)
    console.log('  Address:          ', formatAddress(selectedLocation.address))
    console.log('\n')

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Collect phone number and agent ID
    // ─────────────────────────────────────────────────────────────
    console.log('📞 Step 3: Enter phone number and agent configuration\n')

    // Get phone number
    let phoneNumber: string
    while (true) {
      phoneNumber = await input({
        message: 'Phone number (E.164 format, e.g., +15551234567):',
        validate: (value) => {
          if (!isValidPhoneNumber(value)) {
            return 'Invalid format. Use E.164 format (e.g., +15551234567)'
          }
          return true
        },
      })

      // Check if phone number already exists
      const exists = await phoneNumberExists(phoneNumber)
      if (exists) {
        console.log(`\n  ⚠️  Phone number ${phoneNumber} is already in use. Please enter a different number.\n`)
        continue
      }
      break
    }

    // Get agent ID
    const agentId = await input({
      message: 'ElevenLabs Agent ID:',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Agent ID is required'
        }
        return true
      },
    })

    // Optional: User access
    const grantUserAccess = await confirm({
      message: 'Do you want to grant a specific user access to this location?',
      default: false,
    })

    let userId: string | undefined
    if (grantUserAccess) {
      userId = await input({
        message: 'Clerk User ID (e.g., user_xxx):',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'User ID is required'
          }
          return true
        },
      })

      // Verify user exists
      const user = await prisma.user.findFirst({
        where: {
          clerk_user_id: userId,
          clerk_organization_id: selectedCustomer.clerk_organization_id,
        },
      })

      if (!user) {
        console.log(`\n  ⚠️  User ${userId} not found in this organization. Skipping user access.\n`)
        userId = undefined
      } else {
        console.log(`\n  ✓ Found user: ${user.first_name} ${user.last_name} (${user.email})\n`)
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Confirm and execute
    // ─────────────────────────────────────────────────────────────
    console.log('\n')
    console.log('━'.repeat(60))
    console.log('  📋 Configuration Summary')
    console.log('━'.repeat(60))
    console.log('\n')
    console.log('  Organization:  ', selectedCustomer.clerk_organization_name)
    console.log('  Org ID:        ', selectedCustomer.clerk_organization_id)
    console.log('  Location ID:   ', selectedLocation.id.toString())
    console.log('  Address:       ', formatAddress(selectedLocation.address))
    console.log('  Phone Number:  ', phoneNumber)
    console.log('  Agent ID:      ', agentId)
    if (userId) {
      console.log('  User Access:   ', userId)
    }
    console.log('\n')

    const confirmSetup = await confirm({
      message: 'Create this configuration?',
      default: true,
    })

    if (!confirmSetup) {
      console.log('\n👋 Setup cancelled. No changes made.\n')
      process.exit(0)
    }

    // Execute the setup
    console.log('\n⚙️  Creating configuration...\n')

    // Create phone_number_config
    const phoneConfig = await prisma.phone_number_config.create({
      data: {
        phone_number: phoneNumber,
        location_id: selectedLocation.id,
      },
    })
    console.log(`  ✓ Created phone_number_config (ID: ${phoneConfig.id})`)

    // Create agent_config
    const agentConfig = await prisma.agent_config.create({
      data: {
        agent_id: agentId,
        phone_number_id: phoneConfig.id,
      },
    })
    console.log(`  ✓ Created agent_config (phone_number_id: ${agentConfig.phone_number_id})`)

    // Create user_location_access if requested
    if (userId) {
      await prisma.user_location_access.create({
        data: {
          clerk_organization_id: selectedCustomer.clerk_organization_id,
          clerk_user_id: userId,
          location_id: selectedLocation.id,
        },
      })
      console.log(`  ✓ Granted location access to user ${userId}`)
    }

    console.log('\n')
    console.log('━'.repeat(60))
    console.log('  ✅ Setup complete!')
    console.log('━'.repeat(60))
    console.log('\n')
    console.log('  Next steps:')
    console.log('    1. Verify the agent appears in the customer dashboard')
    console.log('    2. Make a test call to', phoneNumber)
    console.log('    3. Notify the customer that their AI agent is ready')
    console.log('\n')
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      // User pressed Ctrl+C
      console.log('\n\n👋 Setup cancelled.\n')
      process.exit(0)
    }
    console.error('\n❌ Setup failed:', (error as Error).message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
