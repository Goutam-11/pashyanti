import type { Messages } from "./types";

export const mr: Messages = {
  status: {
    ready: "तयार",
    listening: "ऐकत आहोत",
    thinking: "विचारात",
    speaking: "बोलत आहोत",
    repeat: "पुन्हा सांगा",
    noMic: "माइक नाही",
    reconnecting: "जोडत आहोत",
    error: "अडचण",
  },
  empty: {
    title: "समोरच्याचे बोल इथे वाचा",
    body: "उत्तर देण्यासाठी खालील चिप दाबा किंवा तुमचे शब्द लिहा.",
  },
  quickReplies: "पटकन उत्तरे",
  chips: [
    "हो, बोला.",
    "थोडे हळू बोला.",
    "मला समजले.",
    "कृपया पुन्हा सांगा.",
    "एक मिनिट थांबा.",
  ],
  composer: {
    placeholder: "तुमचे उत्तर लिहा…",
    send: "बोला",
    aria: "तुमचे उत्तर लिहा",
  },
  call: { end: "कॉल संपवा", new: "नवीन कॉल" },
  summary: {
    eyebrow: "कॉलचा सारांश",
    agreed: "सहमती",
    next: "पुढे",
    endedLabel: "कॉल संपला",
    endedTitle: "कॉल संपला आहे",
    waiting: "सारांश आल्यावर इथे दिसेल.",
    missing: "या कॉलचा सारांश मिळाला नाही.",
    turns: (n) => `${n} वेळा`,
  },
  retry: {
    main: "समजले नाही — पुन्हा सांगा",
    sub: "ऐकू आले नाही",
  },
  toggles: {
    phoneLine: "फोन लाइन",
    phoneLineCaption: "phone line",
    myVoice: "माझा आवाज",
    myVoiceCaption: "my voice",
    group: "कॉल सेटिंग्ज",
  },
  tour: {
    skip: "सोडा",
    next: "पुढे",
    start: "सुरू करा",
    steps: [
      {
        title: "हे ॲप तुमच्यासाठी ऐकते",
        caption: "लाइव्ह ट्रान्स्क्रिप्ट",
        body: "समोरच्याचे बोल मोठ्या अक्षरांत इथे दिसतात.",
        state: "listening",
      },
      {
        title: "आणि तुमच्यासाठी बोलते",
        caption: "आवाजात उत्तर",
        body: "चिप दाबा किंवा लिहा — तुमचे उत्तर आवाजात समोरच्याला ऐकवले जाते.",
        state: "speaking",
      },
      {
        title: "सुरू करायला तयार",
        caption: "कॉलसाठी तयार",
        body: "स्पष्ट बोला आणि थांबा. उत्तरासाठी खालील चिप दाबा.",
        state: "idle",
      },
    ],
  },
  header: {
    help: "हे कसे काम करते",
    language: "भाषा",
    themeLight: "हलक्या थीमवर जा",
    themeDark: "गडद थीमवर जा",
  },
  mascot: {
    name: "सखी",
    idle: "शांत",
    listening: "ऐकत आहे",
    speaking: "बोलत आहे",
    unsure: "समजले नाही",
  },
};
