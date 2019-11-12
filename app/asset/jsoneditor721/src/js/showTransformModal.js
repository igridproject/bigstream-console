import jmespath from 'jmespath'
import picoModal from 'picomodal'
import Selectr from './assets/selectr/selectr'
import { translate } from './i18n'
import { stringifyPartial } from './jsonUtils'
import { getChildPaths, get, parsePath, parseString, debounce } from './util'
import { MAX_PREVIEW_CHARACTERS } from './constants'

/**
 * Show advanced filter and transform modal using JMESPath
 * @param {HTMLElement} container   The container where to center
 *                                  the modal and create an overlay
 * @param {JSON} json               The json data to be transformed
 * @param {function} onTransform    Callback invoked with the created
 *                                  query as callback
 */
export function showTransformModal (container, json, onTransform) {
  const value = json

  const content = '<label class="pico-modal-contents">' +
      '<div class="pico-modal-header">' + translate('transform') + '</div>' +
      '<p>' +
      'Enter a <a href="http://jmespath.org" target="_blank">JMESPath</a> query to filter, sort, or transform the JSON data.<br/>' +
      'To learn JMESPath, go to <a href="http://jmespath.org/tutorial.html" target="_blank">the interactive tutorial</a>.' +
      '</p>' +
      '<div class="jsoneditor-jmespath-label">' + translate('transformWizardLabel') + ' </div>' +
      '<div id="wizard" class="jsoneditor-jmespath-block jsoneditor-jmespath-wizard">' +
      '  <table class="jsoneditor-jmespath-wizard-table">' +
      '    <tbody>' +
      '      <tr>' +
      '        <th>' + translate('transformWizardFilter') + '</th>' +
      '        <td class="jsoneditor-jmespath-filter">' +
      '          <div class="jsoneditor-inline jsoneditor-jmespath-filter-field" >' +
      '            <select id="filterField">' +
      '            </select>' +
      '          </div>' +
      '          <div class="jsoneditor-inline jsoneditor-jmespath-filter-relation" >' +
      '            <select id="filterRelation">' +
      '              <option value="==">==</option>' +
      '              <option value="!=">!=</option>' +
      '              <option value="<">&lt;</option>' +
      '              <option value="<=">&lt;=</option>' +
      '              <option value=">">&gt;</option>' +
      '              <option value=">=">&gt;=</option>' +
      '            </select>' +
      '          </div>' +
      '          <div class="jsoneditor-inline jsoneditor-jmespath-filter-value" >' +
      '            <input placeholder="value..." id="filterValue" />' +
      '          </div>' +
      '        </td>' +
      '      </tr>' +
      '      <tr>' +
      '        <th>' + translate('transformWizardSortBy') + '</th>' +
      '        <td class="jsoneditor-jmespath-filter">' +
      '          <div class="jsoneditor-inline jsoneditor-jmespath-sort-field">' +
      '            <select id="sortField">' +
      '            </select>' +
      '          </div>' +
      '          <div class="jsoneditor-inline jsoneditor-jmespath-sort-order" >' +
      '            <select id="sortOrder">' +
      '              <option value="asc">Ascending</option>' +
      '              <option value="desc">Descending</option>' +
      '            </select>' +
      '          </div>' +
      '        </td>' +
      '      </tr>' +
      '      <tr id="selectFieldsPart">' +
      '        <th>' + translate('transformWizardSelectFields') + '</th>' +
      '        <td class="jsoneditor-jmespath-filter">' +
      '          <select class="jsoneditor-jmespath-select-fields" id="selectFields" multiple></select>' +
      '        </td>' +
      '      </tr>' +
      '    </tbody>' +
      '  </table>' +
      '</div>' +
      '<div class="jsoneditor-jmespath-label">' + translate('transformQueryLabel') + ' </div>' +
      '<div class="jsoneditor-jmespath-block">' +
      '  <textarea id="query" ' +
      '            rows="4" ' +
      '            autocomplete="off" ' +
      '            autocorrect="off" ' +
      '            autocapitalize="off" ' +
      '            spellcheck="false"' +
      '            title="' + translate('transformQueryTitle') + '">[*]</textarea>' +
      '</div>' +
      '<div class="jsoneditor-jmespath-label">' + translate('transformPreviewLabel') + ' </div>' +
      '<div class="jsoneditor-jmespath-block">' +
      '  <textarea id="preview" ' +
      '      class="jsoneditor-transform-preview"' +
      '      readonly> </textarea>' +
      '</div>' +
      '<div class="jsoneditor-jmespath-block jsoneditor-modal-actions">' +
      '  <input type="submit" id="ok" value="' + translate('ok') + '" autofocus />' +
      '</div>' +
      '</div>'

  picoModal({
    parent: container,
    content: content,
    overlayClass: 'jsoneditor-modal-overlay',
    overlayStyles: {
      backgroundColor: 'rgb(1,1,1)',
      opacity: 0.3
    },
    modalClass: 'jsoneditor-modal jsoneditor-modal-transform',
    focus: false
  })
    .afterCreate(modal => {
      const elem = modal.modalElem()

      const wizard = elem.querySelector('#wizard')
      const ok = elem.querySelector('#ok')
      const filterField = elem.querySelector('#filterField')
      const filterRelation = elem.querySelector('#filterRelation')
      const filterValue = elem.querySelector('#filterValue')
      const sortField = elem.querySelector('#sortField')
      const sortOrder = elem.querySelector('#sortOrder')
      const selectFields = elem.querySelector('#selectFields')
      const query = elem.querySelector('#query')
      const preview = elem.querySelector('#preview')

      if (!Array.isArray(value)) {
        wizard.style.fontStyle = 'italic'
        wizard.innerHTML = '(wizard not available for objects, only for arrays)'
      }

      const sortablePaths = getChildPaths(json)

      sortablePaths.forEach(path => {
        const formattedPath = preprocessPath(path)
        const filterOption = document.createElement('option')
        filterOption.text = formattedPath
        filterOption.value = formattedPath
        filterField.appendChild(filterOption)

        const sortOption = document.createElement('option')
        sortOption.text = formattedPath
        sortOption.value = formattedPath
        sortField.appendChild(sortOption)
      })

      const selectablePaths = getChildPaths(json, true).filter(path => path !== '')
      if (selectablePaths.length > 0) {
        selectablePaths.forEach(path => {
          const formattedPath = preprocessPath(path)
          const option = document.createElement('option')
          option.text = formattedPath
          option.value = formattedPath
          selectFields.appendChild(option)
        })
      } else {
        const selectFieldsPart = elem.querySelector('#selectFieldsPart')
        if (selectFieldsPart) {
          selectFieldsPart.style.display = 'none'
        }
      }

      const selectrFilterField = new Selectr(filterField, { defaultSelected: false, clearable: true, allowDeselect: true, placeholder: 'field...' })
      const selectrFilterRelation = new Selectr(filterRelation, { defaultSelected: false, clearable: true, allowDeselect: true, placeholder: 'compare...' })
      const selectrSortField = new Selectr(sortField, { defaultSelected: false, clearable: true, allowDeselect: true, placeholder: 'field...' })
      const selectrSortOrder = new Selectr(sortOrder, { defaultSelected: false, clearable: true, allowDeselect: true, placeholder: 'order...' })
      const selectrSelectFields = new Selectr(selectFields, { multiple: true, clearable: true, defaultSelected: false, placeholder: 'select fields...' })

      selectrFilterField.on('selectr.change', generateQueryFromWizard)
      selectrFilterRelation.on('selectr.change', generateQueryFromWizard)
      filterValue.oninput = generateQueryFromWizard
      selectrSortField.on('selectr.change', generateQueryFromWizard)
      selectrSortOrder.on('selectr.change', generateQueryFromWizard)
      selectrSelectFields.on('selectr.change', generateQueryFromWizard)

      elem.querySelector('.pico-modal-contents').onclick = event => {
        // prevent the first clear button (in any select box) from getting
        // focus when clicking anywhere in the modal. Only allow clicking links.
        if (event.target.nodeName !== 'A') {
          event.preventDefault()
        }
      }

      query.value = Array.isArray(value) ? '[*]' : '@'

      function preprocessPath (path) {
        return (path === '')
          ? '@'
          : (path[0] === '.')
            ? path.slice(1)
            : path
      }

      function generateQueryFromWizard () {
        if (filterField.value && filterRelation.value && filterValue.value) {
          const field1 = filterField.value
          const examplePath = field1 !== '@'
            ? ['0'].concat(parsePath('.' + field1))
            : ['0']
          const exampleValue = get(value, examplePath)
          const value1 = typeof exampleValue === 'string'
            ? filterValue.value
            : parseString(filterValue.value)

          query.value = '[? ' +
                field1 + ' ' +
                filterRelation.value + ' ' +
                '`' + JSON.stringify(value1) + '`' +
                ']'
        } else {
          query.value = '[*]'
        }

        if (sortField.value && sortOrder.value) {
          const field2 = sortField.value
          if (sortOrder.value === 'desc') {
            query.value += ' | reverse(sort_by(@, &' + field2 + '))'
          } else {
            query.value += ' | sort_by(@, &' + field2 + ')'
          }
        }

        if (selectFields.value) {
          const values = []
          for (let i = 0; i < selectFields.options.length; i++) {
            if (selectFields.options[i].selected) {
              const selectedValue = selectFields.options[i].value
              values.push(selectedValue)
            }
          }

          if (query.value[query.value.length - 1] !== ']') {
            query.value += ' | [*]'
          }

          if (values.length === 1) {
            query.value += '.' + values[0]
          } else if (values.length > 1) {
            query.value += '.{' +
                  values.map(value => {
                    const parts = value.split('.')
                    const last = parts[parts.length - 1]
                    return last + ': ' + value
                  }).join(', ') +
                  '}'
          } else { // values.length === 0
            // ignore
          }
        }

        debouncedUpdatePreview()
      }

      function updatePreview () {
        try {
          const transformed = jmespath.search(value, query.value)

          preview.className = 'jsoneditor-transform-preview'
          preview.value = stringifyPartial(transformed, 2, MAX_PREVIEW_CHARACTERS)

          ok.disabled = false
        } catch (err) {
          preview.className = 'jsoneditor-transform-preview jsoneditor-error'
          preview.value = err.toString()
          ok.disabled = true
        }
      }

      var debouncedUpdatePreview = debounce(updatePreview, 300)

      query.oninput = debouncedUpdatePreview
      debouncedUpdatePreview()

      ok.onclick = event => {
        event.preventDefault()
        event.stopPropagation()

        modal.close()

        onTransform(query.value)
      }

      setTimeout(() => {
        query.select()
        query.focus()
        query.selectionStart = 3
        query.selectionEnd = 3
      })
    })
    .afterClose(modal => {
      modal.destroy()
    })
    .show()
}
