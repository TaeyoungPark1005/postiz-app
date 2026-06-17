import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { PostHookType } from '@prisma/client';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

// Single source of truth for the post-analytics AI model so insight/suggestion
// quality can be upgraded by swapping this one constant. Default: nano tier.
export const HOOK_ANALYSIS_MODEL = 'gpt-5.4-nano';

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

const HOOK_TYPES = [
  'QUESTION',
  'NUMBER',
  'EMPATHY',
  'SHOCK',
  'STORY',
  'HOWTO',
  'OTHER',
] as const;

const HookClassification = z.object({
  hookType: z.enum(HOOK_TYPES),
  confidence: z.number().min(0).max(1),
});

@Injectable()
export class OpenaiService {
  async generateImage(prompt: string, isUrl: boolean, isVertical = false) {
    const generate = (
      await openai.images.generate({
        prompt,
        response_format: isUrl ? 'url' : 'b64_json',
        model: 'dall-e-3',
        ...(isVertical ? { size: '1024x1792' } : {}),
      })
    ).data[0];

    return isUrl ? generate.url : generate.b64_json;
  }

  async generatePromptForPicture(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  async generateVoiceFromText(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  // Classify a post's opening (hook) into one hook type. Runs once per post,
  // right after publish. Returns OTHER/0 on any uncertainty.
  async classifyHookType(
    intro: string
  ): Promise<{ hookType: PostHookType; confidence: number }> {
    const completion = await openai.chat.completions.parse({
      model: HOOK_ANALYSIS_MODEL,
      messages: [
        {
          role: 'system',
          content: `당신은 소셜 미디어 게시물의 "도입부(첫 문장/후킹 문구)"를 보고 후킹 유형 하나로 분류하는 분류기입니다.
유형 정의:
- QUESTION: 질문을 던져 호기심을 유발 (예: "이거 알고 계셨나요?")
- NUMBER: 숫자/통계/리스트로 구체성 강조 (예: "3가지 방법", "90%가 모르는")
- EMPATHY: 독자의 감정/상황에 공감 (예: "다들 이런 적 있죠")
- SHOCK: 충격/반전/역설로 시선을 끔 (예: "사실 정반대였습니다")
- STORY: 경험담/서사로 시작 (예: "어제 이런 일이 있었어요")
- HOWTO: 방법/정보 제공을 예고 (예: "~하는 법", "따라하면 됩니다")
- OTHER: 위 어디에도 명확히 속하지 않음
가장 잘 맞는 유형 하나와 0~1 사이 확신도(confidence)를 반환하세요.`,
        },
        { role: 'user', content: intro.slice(0, 500) },
      ],
      response_format: zodResponseFormat(
        HookClassification,
        'hookClassification'
      ),
    });

    const parsed = completion.choices[0].message.parsed;
    return {
      hookType: (parsed?.hookType as PostHookType) ?? PostHookType.OTHER,
      confidence: parsed?.confidence ?? 0,
    };
  }

  // On-demand Korean natural-language insight from top/bottom performers + hook
  // stats. Used by the workspace analytics "insights" endpoint.
  async summarizeHookInsights(payload: {
    metricLabel: string;
    topPosts: { intro: string; hookType: string | null; value: number }[];
    bottomPosts: { intro: string; hookType: string | null; value: number }[];
    hookStats: { hookType: string; avgValue: number; count: number }[];
  }): Promise<string> {
    const InsightSummary = z.object({ summary: z.string() });
    const completion = await openai.chat.completions.parse({
      model: HOOK_ANALYSIS_MODEL,
      messages: [
        {
          role: 'system',
          content: `당신은 소셜 미디어 운영 분석가입니다. 지표는 "${payload.metricLabel}" 기준입니다.
상위/하위 게시물의 도입부와 후킹 유형별 평균 성과를 보고, 운영자가 바로 활용할 수 있는 한국어 인사이트를 3~5문장으로 요약하세요.
- 어떤 후킹 유형/도입부 패턴이 잘 먹혔는지 근거와 함께
- 피해야 할 패턴
- 다음에 시도할 구체적 제안 1가지
과장 없이, 데이터에 근거해서만 말하세요.`,
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
      response_format: zodResponseFormat(InsightSummary, 'insightSummary'),
    });

    return completion.choices[0].message.parsed?.summary || '';
  }

  // On-demand hook suggestions for a given topic, grounded in what worked.
  async suggestHooks(
    topic: string,
    examples: { intro: string; hookType: string | null; value: number }[]
  ): Promise<string[]> {
    const HookSuggestions = z.object({ suggestions: z.array(z.string()) });
    const completion = await openai.chat.completions.parse({
      model: HOOK_ANALYSIS_MODEL,
      messages: [
        {
          role: 'system',
          content: `당신은 소셜 미디어 카피라이터입니다. 아래 "잘 된 도입부 예시"의 패턴을 참고하여, 주어진 주제에 대한 새로운 후킹 도입부 5개를 한국어로 제안하세요.
- 예시의 패턴(질문형/숫자형/공감형 등)을 살리되 그대로 베끼지 말 것
- 각 제안은 한 문장, 실제 게시물 첫 줄로 바로 쓸 수 있게
- suggestions 배열로 반환`,
        },
        {
          role: 'user',
          content: JSON.stringify({ topic, examples }),
        },
      ],
      response_format: zodResponseFormat(HookSuggestions, 'hookSuggestions'),
    });

    return completion.choices[0].message.parsed?.suggestions || [];
  }

  async generatePosts(content: string) {
    const posts = (
      await Promise.all([
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: 'gpt-4.1',
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                len - 10
              } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await openai.chat.completions.parse({
                    model: 'gpt-4.1',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(text: string) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await openai.chat.completions.parse({
              model: 'gpt-4.1',
              messages: [
                {
                  role: 'system',
                  content: message,
                },
                {
                  role: 'user',
                  content: text,
                },
              ],
              response_format: zodResponseFormat(
                z.object({
                  slides: z
                    .array(
                      z.object({
                        imagePrompt: z.string(),
                        voiceText: z.string(),
                      })
                    )
                    .describe('an array of slides'),
                }),
                'slides'
              ),
            })
          ).choices[0].message.parsed?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }
}
