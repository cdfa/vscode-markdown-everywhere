const vscode = require('vscode');
const { rules: localRules } = require('./rules');
const { processSource } = require('./previewAsMarkdown');

const getLanguageConfiguration = (rules) => {
    let symbol = (rule) => rule.whileSymbol || rule.whileRegExp;
    let symbols = rules
        .filter(rule => symbol(rule))
        .sort((ra, rb) => symbol(rb).length - symbol(ra).length)
        .map(rule => {
            let enterRule = (space) => ({
                beforeText: new RegExp('^\\s*' + rule.whileRegExp + space + '.*'),
                afterText: /.*$/,
                action: {
                    indentAction: 0,
                    appendText: (rule.whileSymbol || rule.whileRegExp) + space
                }
            });
            return Array.from({ length: 21 }).map((v, i) => enterRule(Array.from({ length: 21 + 1 - i }).join(' ')));
        });
    return { onEnterRules: symbols.reduce((a, b) => a.concat(b)) };
}

const vscodeMarkdownRender = {
    /** @type {(src) => String} */
    processSource: function (src) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return src;
        }
        let languageId = editor.document.languageId;
        return processSource(languageId, this.rules, src, this.options);
    },
    processResult: v => v,
    options: { code: 2 },
    /** @type {(src) => undefined} */
    setPreviewMode: function (previewMode) {
        this.options.code = ({
            "splitter": 2,
            "ignored": 0,
            "fenced": 1,
            "folded": 3,
        })[previewMode];
    }
};

const injectRender = (md) => {
    vscodeMarkdownRender.md = md;
    const parse = md.parse;
    md.parse = (src, env) => {
        return parse.call(md, vscodeMarkdownRender.processSource(src), env);
    };
    const rendererRender = md.renderer.render;
    md.renderer.render = (tokens, options, env) => {
        return vscodeMarkdownRender.processResult(rendererRender.call(md.renderer, tokens, options, env));
    };
    return md;
};

const getRules = () => {
    let rules = Array.from(localRules);
    let customizedRules = vscode.workspace.getConfiguration('markdown-everywhere')['customized-rules'];
    if (customizedRules.indexOf("defaultRules") === -1) {
        rules = [];
    }
    return rules.concat(customizedRules.filter(v => v !== "defaultRules"));
}

/** @param {import('vscode').ExtensionContext} context */
exports.activate = function (context) {
    const rules = getRules();
    vscodeMarkdownRender.rules = rules;

    let enhancing = vscode.workspace.getConfiguration('markdown-everywhere')['enhancing-typing'];
    if (enhancing) vscode.languages.setLanguageConfiguration('markdown', getLanguageConfiguration(rules));

    context.subscriptions.push(vscode.commands.registerCommand('markdown-everywhere.showPreviewToSide', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) return; // No open text editor
        let previewMode = vscode.workspace.getConfiguration('markdown-everywhere')['preview-mode'];
        vscodeMarkdownRender.setPreviewMode(previewMode);
        vscode.commands.executeCommand('markdown.showPreviewToSide');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('markdown-everywhere.buildMarkdownEmbeddingRules', () => {
        let rules = getRules();
        require('./generateGrammar').updateGrammars(rules);
        require('./generateInjection').updateInjection(rules);
        require('./generateDocs').updateDocs(rules);
    }));

    return { extendMarkdownIt: injectRender };
}