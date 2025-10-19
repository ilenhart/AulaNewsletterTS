/**
 * Centralized Bedrock AI Prompts
 * All prompts for translation, summarization, and event extraction in one place
 */

/**
 * Context for personalizing prompts
 */
export interface PromptContext {
  parentNames: string;
  childName: string;
  messageFamilyNames: string;
}

/**
 * Centralized class for all Bedrock AI prompts
 * This makes it easy to review and edit all prompts in one location
 */
export class BedrockPrompts {
  constructor(private readonly context: PromptContext) {}

  // ===========================
  // SYSTEM PROMPTS
  // ===========================

  /**
   * Main system prompt with context about Aula, parents, and child
   * Used for summarization tasks
   */
  getSystemPrompt(): string {
    return `<role>You are an expert educational assistant specializing in summarizing Danish school communications from the Aula system.</role>

<context>
- Parents: ${this.context.parentNames}
- Child: ${this.context.childName}
- Flag any mentions of: ${this.context.messageFamilyNames}
</context>

<instructions>
1. Translate all Danish content to English
2. Preserve dates, times, and locations exactly as stated
3. Highlight action items and upcoming events (especially within 3-7 days)
4. Only use information explicitly stated in the source - do not infer or add details
</instructions>

<output_requirements>
- Language: English only
- Tone: Clear, concise, parent-friendly
- Focus: Actionable information relevant to ${this.context.childName}
</output_requirements>`;
  }

  // ===========================
  // TRANSLATION PROMPTS
  // ===========================

  /**
   * Simple translation prompt for Danish to English
   * @param text - The Danish text to translate
   * @param context - Optional context about the text (sender, date, etc.)
   */
  getTranslationPrompt(text: string, context?: string): string {
    let prompt = `<task>Translate the following Danish text to English.</task>

<requirements>
- Preserve proper names (people, places, institutions) in their original form
- Maintain the original tone and formality
- Keep dates, times, and numbers in their original format
- If uncertain about a word, prefer literal translation over interpretation
</requirements>

<output_format>
Return ONLY the translated text. Do NOT wrap your response in any XML tags, HTML tags, or markdown formatting.
Do NOT include tags like <translation>, <result>, or any other wrapper tags.
Just return the plain translated text directly.
</output_format>
`;
    if (context) {
      prompt += `\n<context>${context}</context>\n`;
    }
    prompt += `\n<text>\n${text}\n</text>`;
    return prompt;
  }

  /**
   * Translation + summarization prompt
   * @param content - The Danish content to translate and summarize
   * @param instructions - Specific instructions for summarization
   */
  getTranslateAndSummarizePrompt(content: string, instructions: string): string {
    let prompt = this.getSystemPrompt() + '\n';
    prompt += 'The content below is in Danish. Translate and summarize it according to these instructions:\n';
    prompt += instructions + '\n\n';
    prompt += content;
    return prompt;
  }

  // ===========================
  // SUMMARIZATION PROMPTS
  // ===========================

  /**
   * General summarization prompt (content already in English)
   * @param content - The English content to summarize
   * @param instructions - Specific summarization instructions
   */
  getSummarizationPrompt(content: string, instructions: string): string {
    const prompt = this.getSystemPrompt() + '\n' + instructions + '\n\n' + content;
    return prompt;
  }

  /**
   * Instructions for summarizing daily overviews
   */
  getDailyOverviewInstructions(): string {
    return `<task>Create a concise summary of daily school overviews.</task>

<focus>
- Overall mood and activities from the day
- Any notable achievements or concerns
- Teacher observations about ${this.context.childName}
</focus>

<structure>
1-2 sentences capturing the essence of each day
Group by date if multiple days are present
</structure>

<length>Maximum 3-4 sentences total</length>

<tone>Warm and informative, as if sharing how the school day went</tone>`;
  }

  /**
   * Instructions for summarizing message threads
   */
  getThreadMessagesInstructions(): string {
    return `<task>Summarize message threads from school communications.</task>

<focus>
- Action items or requests directed at parents
- Important information about ${this.context.childName}
- Messages mentioning ${this.context.messageFamilyNames} (HIGHEST PRIORITY)
- Deadlines or time-sensitive information
</focus>

<structure>
Group by thread topic
For each thread: Who said what, and what action (if any) is needed
Use bullet points for clarity
</structure>

<length>2-3 sentences per thread, maximum 5 threads highlighted</length>

<tone>Direct and actionable - parents should know exactly what they need to respond to or do</tone>`;
  }

  /**
   * Instructions for summarizing calendar events
   */
  getCalendarEventsInstructions(): string {
    return `<task>Summarize important calendar events.</task>

<focus>
- Field trips, excursions, special activities
- Parent-teacher meetings or school events
- Holidays, breaks, or schedule changes
- EXCLUDE: Routine daily lessons and standard class periods
</focus>

<structure>
Group by urgency: This Week / Next Week / Later
For each event: What, When, Where
Use bullet points for scannability
</structure>

<length>1 sentence per event, maximum 6-8 events total</length>

<tone>Informative and calendar-focused - help parents plan their schedules</tone>`;
  }

  /**
   * Instructions for summarizing posts
   */
  getPostsInstructions(): string {
    return `<task>Summarize school posts and announcements.</task>

<focus>
- Important announcements affecting ${this.context.childName}
- Policy changes or school-wide updates
- Upcoming events or activities mentioned
- Action items or things parents need to bring/do
</focus>

<structure>
Group by topic or theme
Prioritize time-sensitive announcements first
Use bullet points for clarity
</structure>

<length>2-3 sentences per post, maximum 6 posts highlighted</length>

<tone>Clear and informative - help parents stay informed about school news</tone>`;
  }

  /**
   * Instructions for summarizing derived events
   */
  getDerivedEventsInstructions(): string {
    return `<task>Summarize events extracted from school communications.</task>

<focus>
- Events happening within the next 7 days (HIGHEST PRIORITY)
- Action items requiring parent preparation
- Items to bring, deadlines to meet, or permissions needed
- Events mentioning ${this.context.messageFamilyNames}
</focus>

<structure>
Group by urgency: This Week / Next Week / Later
For each event: What, When, Where, What to Bring/Do
Use bullet points for readability
Merge duplicate events (same event mentioned in multiple places)
</structure>

<length>1-2 sentences per event, maximum 8 events total</length>

<tone>Direct and actionable - parents should know exactly what they need to prepare for and by when</tone>`;
  }

  /**
   * Final consolidated summary prompt
   * Combines all section summaries into structured JSON for HTML email generation
   */
  getFinalSummaryPrompt(sections: {
    overview?: string;
    threads?: string;
    calendar?: string;
    posts?: string;
    derivedEvents?: string;
    upcomingEvents?: string;  // NEW: Unified events from all sources
    importantInfo?: string;   // NEW: Critical non-event information
    generalReminders?: string; // NEW: General reminders and non-critical actionable items
    weeklyHighlights?: string; // NEW: Stories and activities from the week
  }): string {
    let prompt = `<role>You are a friendly parental assistant creating a structured school newsletter.</role>

<context>
Parent Names: ${this.context.parentNames}
Child Name: ${this.context.childName}
Flag Names: ${this.context.messageFamilyNames}
</context>

<task>
Analyze the following sections and organize them into a structured newsletter with specific categories.
</task>

<sections>
`;

    if (sections.importantInfo) {
      prompt += `# Important Information (Critical Alerts)\n${sections.importantInfo}\n\n`;
    }
    if (sections.generalReminders) {
      prompt += `# General Reminders (Non-Critical Actionable Items)\n${sections.generalReminders}\n\n`;
    }
    if (sections.overview) {
      prompt += `# Daily Overview\n${sections.overview}\n\n`;
    }
    if (sections.threads) {
      prompt += `# Message Threads\n${sections.threads}\n\n`;
    }
    if (sections.upcomingEvents) {
      prompt += `# Upcoming Events\n${sections.upcomingEvents}\n\n`;
    } else {
      if (sections.calendar) {
        prompt += `# Scheduled Events\n${sections.calendar}\n\n`;
      }
      if (sections.derivedEvents) {
        prompt += `# Events From Communications\n${sections.derivedEvents}\n\n`;
      }
    }
    if (sections.posts) {
      prompt += `# Announcements\n${sections.posts}\n\n`;
    }
    if (sections.weeklyHighlights) {
      prompt += `# Weekly Highlights\n${sections.weeklyHighlights}\n\n`;
    }

    prompt += `</sections>

<categorization_rules>
1. IMPORTANT INFORMATION:
   - Health alerts (lice, illness outbreaks, allergies)
   - Policy changes (new pickup procedures, schedule changes)
   - Deadlines (permission slips, payment deadlines, registration)
   - Family mentions (any mention of ${this.context.messageFamilyNames})
   - Urgent requests from teachers
   - Type: "health_alert", "policy_change", "deadline", "family_mention", "urgent_request"

2. GENERAL REMINDERS:
   - Things to bring to school (toilet paper, slippers, supplies)
   - Non-urgent parent action items
   - Preparation reminders for activities
   - General notifications parents should remember
   - Example: "Bring 20 toilet paper rolls and slippers next Monday"
   - Simple bullet list format

3. UPCOMING EVENTS:
   - Any event happening in the future
   - Include: title, date, time, location, description, who should attend, requirements
   - Requirements: things to bring, sign up, register, etc.
   - Sort by date (earliest first)

3. WEEKLY HIGHLIGHTS:
   - Stories about what children did (butterflies at the lake, art project, field trip recap)
   - Teacher observations and weekly summaries
   - Past activities and accomplishments
   - NOT events - these are narratives/stories

4. THREAD SUMMARIES:
   - Format: "[Thread Title]: [What it's about and outcomes]. [Tone]"
   - Tone: happy, friendly, contentious, concerned, informational, etc.
   - Focus on topic and outcome, not individual messages or participants
   - Only include meaningful threads (skip "Thanks!" or simple acknowledgments)
</categorization_rules>

<output_format>
Return ONLY valid JSON with this exact structure. Do NOT wrap in markdown code blocks.

{
  "importantInformation": [
    {
      "type": "health_alert",
      "description": "Check children for lice - cases reported in the class",
      "source": "Post from teacher"
    },
    {
      "type": "family_mention",
      "description": "Isaac was mentioned as student of the week for excellent reading progress",
      "source": "Daily overview"
    }
  ],
  "generalReminders": [
    "Bring 20 toilet paper rolls and slippers when you return to school next Monday",
    "Please send in extra snacks for the classroom pantry when you have a chance",
    "Remember to label all children's clothing, especially jackets and hats"
  ],
  "upcomingEvents": [
    {
      "title": "Bingo Night",
      "date": "2025-10-24",
      "time": "18:00",
      "location": "School cafeteria",
      "description": "Family bingo event with communal dinner and games",
      "whoShouldAttend": "Families and children",
      "requirements": ["Bring a dish to share", "Sign up by Tuesday at office"],
      "source": "Calendar"
    }
  ],
  "weeklyHighlights": [
    "The class explored butterflies near the lake on Wednesday - children were fascinated by the monarch migration patterns and sketched their observations",
    "Friday art project: Students created self-portraits using mixed media, showing great creativity and attention to detail"
  ],
  "threadSummaries": [
    {
      "title": "Halloween Costume Policy",
      "summary": "Parents discussed whether costumes should be allowed at school. No final decision yet - waiting for teacher guidance.",
      "tone": "contentious"
    },
    {
      "title": "Carpooling for Field Trip",
      "summary": "Parents organizing carpools for the zoo trip. Sign-up sheet created and shared.",
      "tone": "friendly"
    }
  ]
}

CRITICAL RULES:
- Return ONLY the JSON object
- Do NOT include markdown code fences (no \`\`\`json)
- Do NOT include XML tags
- Do NOT add explanatory text before or after JSON
- If a section has no items, use an empty array []
- All dates in YYYY-MM-DD format
- All times in 24-hour HH:MM format
</output_format>

<examples>
Example with no important info:
{
  "importantInformation": [],
  "generalReminders": [],
  "upcomingEvents": [...],
  "weeklyHighlights": [...],
  "threadSummaries": [...]
}

Example with minimal data:
{
  "importantInformation": [],
  "generalReminders": [],
  "upcomingEvents": [],
  "weeklyHighlights": ["Class had a normal week with reading and math focus"],
  "threadSummaries": []
}
</examples>`;

    return prompt;
  }

  // ===========================
  // EVENT EXTRACTION PROMPTS
  // ===========================

  /**
   * Event extraction prompt for posts
   * Asks AI to extract structured event data from post content
   */
  getEventExtractionPromptForPost(
    title: string,
    content: string,
    timestamp: string
  ): string {
    return `<role>You are an event extraction specialist analyzing school communications.</role>

<task>Extract structured event information from the content below.</task>

<input>
Post Title: ${title}
Post Content: ${content}
Posted On: ${timestamp}
</input>

<extraction_rules>
1. Only extract events explicitly mentioned in the text
2. For dates:
   - Convert to ISO format (YYYY-MM-DD) when possible
   - For relative dates ("next Tuesday", "i morgen"), calculate from Posted On date
   - If ambiguous, preserve original text in EventDate and set Confidence to "low"
3. For missing fields, use empty string "" rather than omitting
4. EventType must be one of: field_trip, deadline, meeting, celebration, sports, holiday, other
5. Confidence levels:
   - "high": Explicit date, time, and description
   - "medium": Clear event but vague timing or details
   - "low": Implied or ambiguous event
</extraction_rules>

<output_format>
Return ONLY a valid JSON array. No markdown, no explanations, no additional text.
</output_format>

<examples>
Example 1 - Clear event:
Input: "School trip to Copenhagen Zoo on October 25th at 9am. Meet at school entrance."
Output: [{"EventTitle": "School Trip to Zoo", "EventDescription": "Class visit to Copenhagen Zoo", "EventDate": "2025-10-25", "EventTime": "09:00", "EventLocation": "Copenhagen Zoo", "EventType": "field_trip", "Confidence": "high"}]

Example 2 - Ambiguous event:
Input: "Remember to bring sports clothes soon for the upcoming activities"
Output: [{"EventTitle": "Sports Activity", "EventDescription": "Bring sports clothes", "EventDate": "", "EventTime": "", "EventLocation": "", "EventType": "sports", "Confidence": "low"}]

Example 3 - No events:
Input: "Thanks everyone for attending last week's meeting. It was very productive."
Output: []

Example 4 - Multiple events:
Input: "Parent-teacher meetings on Nov 5th at 3pm in classroom. Also, winter break starts Dec 20th."
Output: [{"EventTitle": "Parent-Teacher Meeting", "EventDescription": "Parent-teacher meetings", "EventDate": "2025-11-05", "EventTime": "15:00", "EventLocation": "Classroom", "EventType": "meeting", "Confidence": "high"}, {"EventTitle": "Winter Break", "EventDescription": "Winter break starts", "EventDate": "2025-12-20", "EventTime": "", "EventLocation": "", "EventType": "holiday", "Confidence": "high"}]
</examples>
`;
  }

  /**
   * Event extraction prompt for messages
   * Asks AI to extract structured event data from message text
   */
  getEventExtractionPromptForMessage(
    messageText: string,
    sentDate: string,
    senderName: string
  ): string {
    return `<role>You are an event extraction specialist analyzing school communications.</role>

<task>Extract structured event information from the message below.</task>

<input>
Message From: ${senderName}
Message Sent: ${sentDate}
Message Text: ${messageText}
</input>

<extraction_rules>
1. Only extract events explicitly mentioned in the text
2. For dates:
   - Convert to ISO format (YYYY-MM-DD) when possible
   - For relative dates ("next Tuesday", "tomorrow"), calculate from Message Sent date
   - If ambiguous, preserve original text in EventDate and set Confidence to "low"
3. For missing fields, use empty string "" rather than omitting
4. EventType must be one of: field_trip, deadline, meeting, celebration, sports, holiday, other
5. Confidence levels:
   - "high": Explicit date, time, and description
   - "medium": Clear event but vague timing or details
   - "low": Implied or ambiguous event
</extraction_rules>

<output_format>
Return ONLY a valid JSON array. No markdown, no explanations, no additional text.
</output_format>

<examples>
Example 1 - Clear event:
Input: "Reminder: Parent-teacher meeting tomorrow at 3:30pm in Classroom 3B to discuss student progress"
Output: [{"EventTitle": "Parent-Teacher Meeting", "EventDescription": "Discussion about student progress", "EventDate": "2025-10-19", "EventTime": "15:30", "EventLocation": "Classroom 3B", "EventType": "meeting", "Confidence": "high"}]

Example 2 - Deadline:
Input: "Please submit permission slips by Friday for the museum trip"
Output: [{"EventTitle": "Permission Slip Deadline", "EventDescription": "Submit permission slips for museum trip", "EventDate": "2025-10-21", "EventTime": "", "EventLocation": "", "EventType": "deadline", "Confidence": "medium"}]

Example 3 - No events:
Input: "Thank you for your continued support. Have a great day!"
Output: []

Example 4 - Vague event:
Input: "Don't forget to pack extra clothes for outdoor activities this week"
Output: [{"EventTitle": "Outdoor Activities", "EventDescription": "Pack extra clothes for outdoor activities", "EventDate": "", "EventTime": "", "EventLocation": "", "EventType": "other", "Confidence": "low"}]
</examples>
`;
  }

  // ===========================
  // SEMANTIC EVENT MATCHING PROMPTS
  // ===========================

  /**
   * Semantic comparison prompt to determine if two events are the same
   * Used for deduplication across multiple posts/messages
   */
  getEventComparisonPrompt(
    newEvent: {
      EventTitle: string;
      EventDescription: string;
      EventDate: string;
      EventTime?: string;
      EventLocation?: string;
      EventType?: string;
    },
    existingEvent: {
      EventTitle: string;
      EventDescription: string;
      EventDate: string;
      EventTime?: string;
      EventLocation?: string;
      EventType?: string;
    }
  ): string {
    return `<role>You are an event deduplication specialist.</role>

<task>Determine if these two events refer to the SAME real-world event.</task>

<new_event>
Title: ${newEvent.EventTitle}
Date: ${newEvent.EventDate}
Time: ${newEvent.EventTime || 'Not specified'}
Location: ${newEvent.EventLocation || 'Not specified'}
Description: ${newEvent.EventDescription}
Type: ${newEvent.EventType || 'Not specified'}
</new_event>

<existing_event>
Title: ${existingEvent.EventTitle}
Date: ${existingEvent.EventDate}
Time: ${existingEvent.EventTime || 'Not specified'}
Location: ${existingEvent.EventLocation || 'Not specified'}
Description: ${existingEvent.EventDescription}
Type: ${existingEvent.EventType || 'Not specified'}
</existing_event>

<matching_rules>
SAME EVENT if:
- Date is within ±1 day (allows for minor corrections/clarifications)
- Same or similar location (semantic match: "Zoo" = "Copenhagen Zoo" = "Zoologisk Have")
- Same or similar activity (semantic match: "Zoo trip" = "Visit to zoo" = "Field trip to the zoo")
- Time differences acceptable if date/location/activity strongly match

DIFFERENT EVENTS if:
- Dates differ by more than 2 days
- Clearly different locations (School vs Museum)
- Clearly different activities (Sports day vs Parent meeting)
- Different event types (field_trip vs deadline)

AMBIGUOUS CASES:
- If one event has specific details and the other is vague, they may still be the same
- "Sports activity" (vague) might match "Soccer game on Friday" (specific)
- Use context and common sense
</matching_rules>

<output_format>
Return ONLY valid JSON with this exact structure:
{
  "isSameEvent": true,
  "confidence": "high",
  "reason": "Both events refer to the school trip to Copenhagen Zoo on October 25th"
}

OR

{
  "isSameEvent": false,
  "confidence": "high",
  "reason": "Different dates (Oct 25 vs Nov 5) and different activities (zoo trip vs parent meeting)"
}

Confidence levels:
- "high": Clear match or clear mismatch
- "medium": Likely but some ambiguity
- "low": Uncertain, could go either way
</output_format>`;
  }

  /**
   * Event merging prompt to combine information from multiple sources
   * Prioritizes newer information while preserving all relevant details
   */
  getEventMergingPrompt(
    existingEvent: {
      EventTitle: string;
      EventDescription: string;
      EventDate: string;
      EventTime?: string;
      EventLocation?: string;
      EventType?: string;
      FirstMentionedAt: string;
      LastUpdatedAt: string;
    },
    newEvent: {
      EventTitle: string;
      EventDescription: string;
      EventDate: string;
      EventTime?: string;
      EventLocation?: string;
      EventType?: string;
    },
    newEventSourceDate: string
  ): string {
    return `<role>You are an event information merger.</role>

<task>Merge information about the same event from multiple sources, prioritizing newer information.</task>

<existing_event>
Title: ${existingEvent.EventTitle}
Date: ${existingEvent.EventDate}
Time: ${existingEvent.EventTime || 'Not specified'}
Location: ${existingEvent.EventLocation || 'Not specified'}
Description: ${existingEvent.EventDescription}
Type: ${existingEvent.EventType || 'Not specified'}

First Mentioned: ${existingEvent.FirstMentionedAt}
Last Updated: ${existingEvent.LastUpdatedAt}
</existing_event>

<new_information>
Source Date: ${newEventSourceDate}

Title: ${newEvent.EventTitle}
Date: ${newEvent.EventDate}
Time: ${newEvent.EventTime || 'Not specified'}
Location: ${newEvent.EventLocation || 'Not specified'}
Description: ${newEvent.EventDescription}
Type: ${newEvent.EventType || 'Not specified'}
</new_information>

<merging_rules>
1. PRIORITIZE NEWER INFORMATION for:
   - Date changes (may be corrections or updates)
   - Time changes (may be corrections or updates)
   - Location changes (may be corrections or more specific)
   - Cancellations or postponements mentioned in new info

2. COMBINE DESCRIPTIONS:
   - Merge descriptions to include all relevant details
   - If new description says "cancelled" or "postponed", reflect that
   - If new description adds details (what to bring, what to wear), include them
   - Remove redundant information

3. USE MOST COMPLETE INFORMATION:
   - If existing has time but new doesn't, keep existing time (unless new explicitly changes it)
   - If existing has location but new doesn't, keep existing location
   - Prefer specific over vague

4. DETECT CANCELLATIONS/CHANGES:
   - Keywords: "cancelled", "postponed", "moved to", "changed to", "new date", "new time"
   - If detected, prioritize new information completely
</merging_rules>

<output_format>
Return ONLY valid JSON with this exact structure:
{
  "EventTitle": "Merged event title",
  "EventDate": "2025-10-25",
  "EventTime": "09:00",
  "EventLocation": "Copenhagen Zoo",
  "EventDescription": "Merged description with all relevant details",
  "EventType": "field_trip",
  "MergeNotes": "Brief note about what changed: e.g., 'Updated time from 9am to 10am' or 'Added requirement to bring packed lunch' or 'No changes, just confirmation'"
}
</output_format>

<examples>
Example 1 - Time update:
Existing: {Title: "Zoo Trip", Date: "2025-10-25", Time: "09:00", Location: "Copenhagen Zoo", Description: "Visit to zoo"}
New: {Title: "Zoo Visit", Date: "2025-10-25", Time: "10:00", Location: "Zoo", Description: "Trip to Copenhagen Zoo"}
Output: {
  "EventTitle": "Zoo Trip",
  "EventDate": "2025-10-25",
  "EventTime": "10:00",
  "EventLocation": "Copenhagen Zoo",
  "EventDescription": "Visit to Copenhagen Zoo",
  "EventType": "field_trip",
  "MergeNotes": "Updated start time from 09:00 to 10:00"
}

Example 2 - Additional details:
Existing: {Title: "Parent Meeting", Date: "2025-11-05", Time: "15:00", Location: "Classroom", Description: "Parent-teacher meeting"}
New: {Title: "Parent-Teacher Conference", Date: "2025-11-05", Time: "", Location: "Classroom 3B", Description: "Meeting to discuss student progress. Bring report card."}
Output: {
  "EventTitle": "Parent-Teacher Meeting",
  "EventDate": "2025-11-05",
  "EventTime": "15:00",
  "EventLocation": "Classroom 3B",
  "EventDescription": "Parent-teacher meeting to discuss student progress. Bring report card.",
  "EventType": "meeting",
  "MergeNotes": "Added specific location (Classroom 3B) and requirement to bring report card"
}

Example 3 - Cancellation:
Existing: {Title: "Sports Day", Date: "2025-10-20", Time: "10:00", Location: "School Field", Description: "Annual sports day"}
New: {Title: "Sports Day", Date: "2025-10-27", Time: "", Location: "", Description: "Sports day has been postponed to next Friday due to weather"}
Output: {
  "EventTitle": "Sports Day (Postponed)",
  "EventDate": "2025-10-27",
  "EventTime": "10:00",
  "EventLocation": "School Field",
  "EventDescription": "Annual sports day, postponed from Oct 20 to Oct 27 due to weather",
  "EventType": "sports",
  "MergeNotes": "Event postponed from 2025-10-20 to 2025-10-27 due to weather"
}
</examples>`;
  }

  // ===========================
  // NEWSLETTER EVENT DEDUPLICATION
  // ===========================

  /**
   * Prompt for real-time event deduplication during newsletter generation
   * Combines events from calendar + derived sources intelligently
   */
  getNewsletterEventDeduplicationPrompt(events: Array<{
    EventTitle: string;
    EventDescription: string;
    EventDate: string;
    EventTime?: string;
    EventLocation?: string;
    EventType?: string;
    SourceType: string;
    SourceConfidence: string;
    SourceIds: string[];
  }>): string {
    const eventsList = events.map((e, i) => `
Event ${i + 1}:
  Title: ${e.EventTitle}
  Date: ${e.EventDate}
  Time: ${e.EventTime || 'Not specified'}
  Location: ${e.EventLocation || 'Not specified'}
  Description: ${e.EventDescription}
  Type: ${e.EventType || 'Not specified'}
  Source: ${e.SourceType} (Confidence: ${e.SourceConfidence})
  Source IDs: ${e.SourceIds.join(', ')}
`).join('\n');

    return `<role>You are an event consolidation specialist for a school newsletter.</role>

<task>Combine and deduplicate these events for the newsletter's "Upcoming Events" section.</task>

<events>
${eventsList}
</events>

<deduplication_rules>
1. CALENDAR EVENTS (source: calendar, confidence: high):
   - These are authoritative from the official school calendar
   - Always include them
   - If a derived event matches a calendar event, merge descriptions but keep calendar's date/time/location

2. DERIVED EVENTS (source: derived_post/derived_message, confidence: medium/low):
   - Extracted from posts and messages
   - May duplicate each other or calendar events
   - Use semantic matching: same date (±1 day acceptable), similar title/location, similar activity
   - Combine if they clearly refer to the same event

3. SAME-DATE EVENTS:
   - If multiple events have the same date and similar titles/activities, they are likely the same event
   - Examples of same event:
     * "Zoo Trip" + "Visit to Copenhagen Zoo" + "Field trip to the zoo"
     * "Parent Meeting" + "Parent-Teacher Conference" + "Classroom meeting with parents"
   - Examples of different events:
     * "Zoo Trip" + "Museum Visit" (different activities)
     * "Morning Assembly" + "Afternoon Sports" (different times/activities)

4. MERGING LOGIC when events are duplicates:
   - Use calendar event's date/time/location if available (most authoritative)
   - Combine descriptions to include ALL relevant details
   - If derived events add useful information (what to bring, dress code, requirements), include it
   - List all sources in a note
   - Mark high-confidence events as "Official calendar event"

5. KEEP SEPARATE when events are different:
   - Different dates (more than 1 day apart)
   - Different activities/purposes
   - Different locations
   - Clearly distinct events

6. OUTPUT REQUIREMENTS:
   - Return consolidated list with NO duplicates
   - Each event should have complete information from all sources that mentioned it
   - Sort by date (earliest first)
   - Include source attribution
</deduplication_rules>

<output_format>
Return ONLY valid JSON array with NO markdown formatting:
[
  {
    "EventTitle": "Zoo Trip",
    "EventDate": "2025-10-25",
    "EventTime": "09:00",
    "EventLocation": "Copenhagen Zoo",
    "EventDescription": "Class field trip to Copenhagen Zoo (Official calendar event). Bring packed lunch and wear comfortable walking shoes.",
    "EventType": "field_trip",
    "Sources": ["Calendar Event #123", "Post #456", "Message #789"],
    "Confidence": "high",
    "MergedFromIds": ["calendar-123", "derived-abc", "derived-xyz"]
  }
]

IMPORTANT: Return ONLY the JSON array. Do not wrap in markdown code blocks.
</output_format>

<examples>
Example 1 - Calendar + Derived Match:
Input:
  Event 1: Title="Zoo Trip", Date="2025-10-25", Time="09:00", Source=calendar
  Event 2: Title="Visit to zoo", Date="2025-10-25", Time="", Source=derived_post
  Event 3: Title="Remember packed lunch for zoo", Date="2025-10-25", Source=derived_message
Output:
[{
  "EventTitle": "Zoo Trip",
  "EventDate": "2025-10-25",
  "EventTime": "09:00",
  "EventLocation": "Copenhagen Zoo",
  "EventDescription": "Class field trip to Copenhagen Zoo (Official calendar event). Remember to bring packed lunch.",
  "EventType": "field_trip",
  "Sources": ["Calendar", "Post", "Message"],
  "Confidence": "high",
  "MergedFromIds": ["all three events"]
}]

Example 2 - Different Events:
Input:
  Event 1: Title="Parent Meeting", Date="2025-10-20", Source=calendar
  Event 2: Title="Sports Day", Date="2025-10-25", Source=calendar
Output:
[
  {
    "EventTitle": "Parent Meeting",
    "EventDate": "2025-10-20",
    "EventDescription": "Parent-teacher meeting (Official calendar event)",
    "Confidence": "high"
  },
  {
    "EventTitle": "Sports Day",
    "EventDate": "2025-10-25",
    "EventDescription": "Annual sports day (Official calendar event)",
    "Confidence": "high"
  }
]
</examples>`;
  }
}
