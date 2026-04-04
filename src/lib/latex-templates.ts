export const LATEX_TEMPLATES: Record<string, string> = {
  plain: `\\documentclass[12pt]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{cite}

\\title{Your Paper Title}
\\author{Author Name \\\\ Institution \\\\ \\texttt{email@example.com}}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\section{Introduction}
% Introduce the problem and motivation.

\\section{Related Work}
% Discuss prior work and how your approach differs.

\\section{Methodology}
% Describe your approach in detail.

\\section{Results}
% Present your findings.

\\section{Conclusion}
% Summarize contributions and future work.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,

  acm: `\\documentclass[sigconf,review]{acmart}

\\usepackage{booktabs}

\\title{Your Paper Title}
\\author{Author Name}
\\affiliation{%
  \\institution{University Name}
  \\city{City}
  \\country{Country}
}
\\email{email@example.com}

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\keywords{keyword1, keyword2, keyword3}

\\begin{document}

\\maketitle

\\section{Introduction}
% Introduce the problem and motivation.

\\section{Related Work}
% Discuss prior work.

\\section{Methodology}
% Describe your approach.

\\section{Evaluation}
% Present experiments and results.

\\section{Conclusion}
% Summarize and discuss future work.

\\bibliographystyle{ACM-Reference-Format}
\\bibliography{references}

\\end{document}
`,

  ieee: `\\documentclass[conference]{IEEEtran}

\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}

\\title{Your Paper Title}
\\author{
  \\IEEEauthorblockN{Author Name}
  \\IEEEauthorblockA{
    \\textit{Department} \\\\
    \\textit{University Name} \\\\
    City, Country \\\\
    email@example.com
  }
}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\begin{IEEEkeywords}
keyword1, keyword2, keyword3
\\end{IEEEkeywords}

\\section{Introduction}
% Introduce the problem and motivation.

\\section{Related Work}
% Discuss prior work.

\\section{Proposed Method}
% Describe your approach.

\\section{Experiments}
% Present experiments and results.

\\section{Conclusion}
% Summarize and discuss future work.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`,

  neurips: `\\documentclass{article}

\\usepackage[final]{neurips_2024}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{hyperref}
\\usepackage{url}
\\usepackage{booktabs}
\\usepackage{amsfonts}
\\usepackage{nicefrac}
\\usepackage{microtype}

\\title{Your Paper Title}

\\author{
  Author Name \\\\
  Department \\\\
  University Name \\\\
  \\texttt{email@example.com}
}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\section{Introduction}
% Introduce the problem and motivation.

\\section{Related Work}
% Discuss prior work.

\\section{Method}
% Describe your approach.

\\section{Experiments}
% Present experiments and results.

\\section{Conclusion}
% Summarize and discuss future work.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,
};
